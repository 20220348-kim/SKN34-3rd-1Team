"""Concrete integrations for the selected file editors (no format fallbacks)."""
import base64
from collections import defaultdict
import os
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import zipfile
from xml.etree import ElementTree

import httpx

from app.application_preparation.document_contract import (
    DocumentError, DocumentMap, ENGINES, GenerateDocumentRequest, MAX_BYTES,
    NativeTarget, WritePlan, digest, edited_text,
)
from app.application_preparation.document_mcp import document_session


def read_output(path: Path, root: Path) -> bytes:
    if path.is_symlink() or not path.is_file() or path.resolve().parent != root.resolve():
        raise DocumentError("VALIDATION_FAILED")
    if not 0 < path.stat().st_size <= MAX_BYTES:
        raise DocumentError("LIMIT_EXCEEDED")
    return path.read_bytes()


def validate_hwpx(path: Path):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 256 or len({e.filename for e in entries}) != len(entries) or sum(e.file_size for e in entries) > MAX_BYTES:
            raise DocumentError("LIMIT_EXCEEDED")
        if archive.read("mimetype").strip() != b"application/hwp+zip":
            raise DocumentError("UNSUPPORTED")
        for entry in entries:
            if entry.filename.endswith(".xml"):
                data = archive.read(entry)
                if b"<!DOCTYPE" in data.replace(b"\x00", b"").upper() or b"<!ENTITY" in data.replace(b"\x00", b"").upper():
                    raise DocumentError("UNSUPPORTED")
                ElementTree.fromstring(data)


class HwpxDocumentAdapter:
    async def inspect(self, path: Path) -> DocumentMap:
        validate_hwpx(path)
        async with document_session("hwpx", path.parent) as session:
            result = await session.call("inspect_editable_regions", {"path": str(path), "compact": False})
        if result["source_sha256"] != digest(path.read_bytes()):
            raise DocumentError("SOURCE_CHANGED")
        targets = []
        for item in [*result["regions"], *result["unsupported_controls"]]:
            locator = {key: item.get(key) for key in ("target", "kind", "section", "table", "row", "col", "paragraph_count")}
            context = str({k: v for k, v in locator.items() if v is not None})
            targets.append(NativeTarget(targetId=item["target"], nativeLocator=locator, kind=item["kind"],
                                        currentText=item["text"], context=context[:1000], editable=item["editable"],
                                        unsupportedReason=item.get("reason")))
            for paragraph in item.get("paragraphs", []):
                targets.append(NativeTarget(targetId=paragraph["target"], nativeLocator={**locator, "target": paragraph["target"], "kind": "paragraph", "parent": item["target"]},
                                            kind="paragraph", currentText=paragraph["text"], context=item["text"][:1000]))
        for i, target in enumerate(targets):
            target.context = (target.context + " | " + " | ".join(t.currentText for t in targets[max(0, i-2):i+3]))[:1000]
        return DocumentMap(sourceSha256=result["source_sha256"], format="hwpx", engineVersion=ENGINES["hwpx"], targets=targets)

    async def apply(self, path: Path, document: DocumentMap, plan: WritePlan, facts: dict[str, str]) -> tuple[bytes, dict]:
        fresh = await self.inspect(path)
        targets = {t.targetId: t for t in fresh.targets}
        grouped = defaultdict(list)
        for operation in plan.operations:
            if operation.operation in {"set_check", "set_field"}:
                raise DocumentError("UNSUPPORTED")
            if targets[operation.targetId].currentText != operation.expectedText:
                raise DocumentError("SOURCE_CHANGED")
            grouped[operation.targetId].append(operation)
        edits = [{"target": key, "kind": targets[key].nativeLocator["kind"], "operation": "replace_text",
                  "expected_text": targets[key].currentText, "value": edited_text(targets[key], operations, facts)}
                 for key, operations in grouped.items()]
        for edit in edits:
            if edit["kind"] == "cell" and "\n" in edit["value"] and not edit["expected_text"].strip():
                children = [t for t in targets.values() if t.nativeLocator.get("parent") == edit["target"]]
                if len(children) != 1:
                    raise DocumentError("UNSUPPORTED")
                # Resolve the actually inspected sole paragraph; never invent an ordinal.
                edit.update(target=children[0].targetId, kind="paragraph", expected_text=children[0].currentText)
        output = path.parent / "completed.hwpx"
        async with document_session("hwpx", path.parent) as session:
            preview = await session.call("preview_addressed_edits", {"path": str(path), "edits": edits})
            counts = preview["counts"]
            if counts["requested"] != len(edits) or counts["resolved"] != len(edits) or counts["unresolved"] != 0 or preview["unresolved"]:
                raise DocumentError("MAPPING_FAILED")
            applied = await session.call("apply_addressed_edits", {"session_id": preview["session_id"], "out_path": str(output)})
            if applied["counts"]["applied"] != len(edits) or applied["counts"]["unresolved"]:
                raise DocumentError("VALIDATION_FAILED")
            validate_hwpx(output)
            expected = []
            for edit in preview["edits"]:
                expected.extend(edit.get("verify_expansion") or [{"target": edit["target"], "expected_text": edit["after_text"]}])
            verified = await session.call("govbiz_verify_hwpx_edits", {"source_path": str(path), "output_path": str(output), "expected_targets": expected})
            if verified["verified"] is not True or verified["counts"]["verified"] != len(expected):
                raise DocumentError("VALIDATION_FAILED")
        data = read_output(output, path.parent)
        validate_hwpx(output)
        if digest(path.read_bytes()) != document.sourceSha256:
            raise DocumentError("SOURCE_CHANGED")
        return data, {"requested": len(edits), "resolved": len(edits), "applied": len(edits), "verified": len(expected), "unresolved": 0,
                      "xml": "PASSED", "render": "NOT_RUN", "hancom": "NOT_RUN"}


class PdfDocumentAdapter:
    async def inspect(self, path: Path, request: GenerateDocumentRequest) -> DocumentMap:
        if not path.read_bytes().startswith(b"%PDF-") or not request.pageImages:
            raise DocumentError("UNSUPPORTED")
        fields = {field.targetId: field for field in request.pdfFields}
        targets = []
        for target in request.pdfTargets:
            field = fields.get(target.id)
            is_field = target.id.startswith("pdf-field:")
            targets.append(NativeTarget(targetId=target.id, nativeLocator=field.model_dump() if field else {"target": target.id},
                kind="PDF_FIELD" if is_field else "PDF_PAGE", label=target.context, currentText=target.text, context=target.context,
                editable=(field.editable if field else not is_field), unsupportedReason=None if (field and field.editable) or not is_field else "FIELD_NOT_EDITABLE_OR_METADATA_MISSING"))
        async with document_session("pdf", path.parent) as session:
            text = await session.call("pdf_get_text", {"pdf_path": str(path)})
            if text["page_count"] != len(request.pageImages) or not 1 <= text["page_count"] <= 50:
                raise DocumentError("LIMIT_EXCEEDED")
            if not text["text"].strip():
                raise DocumentError("UNSUPPORTED")
            # Do not use pdf_inspect: upstream swallows individual page failures.
            for page in range(text["page_count"]):
                layout = await session.call("pdf_get_text_layout", {"pdf_path": str(path), "page": page})
                if not layout["blocks"] and any(t.targetId == f"page-{page}" and t.currentText.strip() for t in targets):
                    raise DocumentError("UNSUPPORTED")
                paragraphs = await session.call("pdf_detect_paragraphs", {"pdf_path": str(path), "page": page})
                for index, paragraph in enumerate(paragraphs["paragraphs"]):
                    targets.append(NativeTarget(targetId=f"pdf-text:{page}:{index}", kind="PDF_TEXT", currentText=paragraph["text"],
                                                nativeLocator={"page": page, "bbox": paragraph["bbox"], "fontName": paragraph["font_name"],
                                                               "fontSize": paragraph["font_size"], "geometryVerified": False},
                                                context=f"PDF page {page + 1}; native paragraph; use image for visual bounds"))
        return DocumentMap(sourceSha256=digest(path.read_bytes()), format="pdf", engineVersion=ENGINES["pdf"], targets=targets)

    async def apply(self, path: Path, document: DocumentMap, plan: WritePlan, facts: dict[str, str]) -> tuple[bytes, dict]:
        targets = {t.targetId: t for t in document.targets}
        current = path
        deletions = [op for op in plan.operations if op.operation == "delete_range"]
        warnings = []
        async with document_session("pdf", path.parent) as session:
            for index, operation in enumerate(deletions):
                target = targets[operation.targetId]
                if target.kind != "PDF_TEXT":
                    raise DocumentError("UNSUPPORTED")
                search = target.currentText[operation.start:operation.end]
                # Refuse a repeated occurrence rather than deleting another form's example.
                matches = await session.call("pdf_find_text", {"pdf_path": str(current), "search": search})
                if len(matches["matches"]) != 1 or matches["matches"][0]["page"] != target.nativeLocator["page"]:
                    raise DocumentError("MAPPING_FAILED")
                output = path.parent / f"cleaned-{index}.pdf"
                result = await session.call("pdf_replace_single", {"pdf_path": str(current), "search": search,
                    "replacement": "", "output_path": str(output), "match_index": 0, "reflow": False})
                fidelity = result["fidelity"]
                if result.get("warnings") or fidelity["overflow_detected"] or fidelity["glyphs_missing"] or fidelity["font_substituted"]:
                    raise DocumentError("VALIDATION_FAILED")
                if fidelity["degradations"]:
                    if any(d["kind"] != "positioning_adjustment_skipped" for d in fidelity["degradations"]):
                        raise DocumentError("VALIDATION_FAILED")
                    proof = await session.call("govbiz_verify_pdf_deletion", {"source_path": str(current), "output_path": str(output), "expected_text": search})
                    if proof.get("verified") is not True or proof.get("sourceSha256") != digest(current.read_bytes()) or proof.get("outputSha256") != digest(output.read_bytes()):
                        raise DocumentError("VALIDATION_FAILED")
                    warnings.append({"code": "positioning_adjustment_skipped", "disposition": "WHOLE_TEXT_OBJECT_DELETION_VERIFIED", "changedTextObjects": proof["changedTextObjects"]})
                read_output(output, path.parent)
                remaining = await session.call("pdf_find_text", {"pdf_path": str(output), "search": search})
                if remaining["matches"]:
                    raise DocumentError("VALIDATION_FAILED")
                current = output
        placements = []
        for op in plan.operations:
            if op.operation == "delete_range":
                continue
            if op.operation != "set_field" or targets[op.targetId].kind not in {"PDF_PAGE", "PDF_FIELD"}:
                raise DocumentError("UNSUPPORTED")
            placements.append({"factId": op.valueRef, "targetId": op.targetId, "box": op.box.model_dump() if op.box else None})
        return read_output(current, path.parent), {"stage": "PDFBOX_REQUIRED", "deletionsVerified": len(deletions), "placements": placements, "warnings": warnings, "render": "NOT_RUN"}


class HwpDocumentAdapter:
    async def job(self, request: dict) -> dict:
        url = os.getenv("DOCUMENT_HWP_BRIDGE_URL", "")
        token = os.getenv("DOCUMENT_HWP_BRIDGE_TOKEN", "")
        parsed = httpx.URL(url)
        if not url or len(token) < 32 or (parsed.scheme != "https" and parsed.host not in {"127.0.0.1", "localhost", "host.docker.internal"}):
            raise DocumentError("MCP_NOT_READY")
        try:
            async with httpx.AsyncClient(timeout=130, follow_redirects=False, trust_env=False) as client:
                response = await client.post(url.rstrip("/") + "/internal/v1/document-job", json=request, headers={"Authorization": "Bearer " + token})
                if response.status_code != 200:
                    code = response.json().get("detail", {}).get("code", "APPLICATION_DOCUMENT_MCP_FAILED")
                    if code not in {"APPLICATION_DOCUMENT_MCP_NOT_READY", "APPLICATION_DOCUMENT_UNSUPPORTED", "APPLICATION_DOCUMENT_OUTCOME_UNKNOWN", "APPLICATION_DOCUMENT_RUN_CONFLICT"}:
                        code = "APPLICATION_DOCUMENT_MCP_FAILED"
                    raise DocumentError(code.removeprefix("APPLICATION_DOCUMENT_"))
                return response.json()
        except httpx.TimeoutException as error:
            raise DocumentError("OUTCOME_UNKNOWN") from error
        except httpx.HTTPError as error:
            raise DocumentError("MCP_NOT_READY") from error
        except (ValueError, TypeError) as error:
            raise DocumentError("OUTCOME_UNKNOWN") from error


async def assist_with_kordoc(path: Path, document: DocumentMap):
    # Only missing primary context needs a second reader. Its addresses never become edit addresses.
    texts = [t.currentText for t in document.targets if t.currentText.strip() and not t.nativeLocator.get("parent")]
    needs_context = any(not t.context.strip() for t in document.targets if t.editable)
    repeated_labels = len(texts) != len(set(texts))
    if not needs_context and not repeated_labels:
        return
    with TemporaryDirectory(prefix="govbiz-read-") as directory:
        root = Path(directory).resolve()
        copy = root / ("read-only" + path.suffix)
        shutil.copyfile(path, copy)
        copy.chmod(0o400)
        try:
            async with document_session("kordoc", root) as session:
                result = await session.call("parse_document", {"file_path": str(copy), "ocr": False, "formula_ocr": False,
                    "remove_header_footer": False, "keep_empty_paragraphs": True, "keep_trailing_empty_cols": True})
            if digest(copy.read_bytes()) != document.sourceSha256:
                raise DocumentError("VALIDATION_FAILED")
            text = result["text"]
            # Only attach exact primary text matches, never kordoc cell IDs or inferred coordinates.
            matched = [t for t in document.targets if t.currentText.strip() and t.currentText in text]
            if not matched:
                raise DocumentError("MAPPING_FAILED")
            document.auxiliaryText = "\n".join(t.currentText for t in matched)[:40000]
            document.auxiliaryStatus = "READ_ONLY_EXACT_TEXT_MATCHED"
        finally:
            copy.chmod(0o600)
