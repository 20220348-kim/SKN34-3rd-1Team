"""Versioned document map and server-bound write plan. No executable model output."""
import base64
import hashlib
import json
from typing import Literal

from pydantic import Field, model_validator

from app.application_preparation.models import Contract
from app.application_preparation.document import DocumentBox, DocumentFact, DocumentTarget, DocumentPlacement

CONTRACT = "application-document-mcp-v1"
MAP_VERSION = "native-map-v3"
PLAN_VERSION = "confirmed-facts-bound-v2"
ENGINES = {
    "hwp": "Topabaem05/hwpx-mcp@5993e014dd5bec68770379f2532ed0c1502a9952+govbiz-fields-v1",
    "hwpx": "pblsketch/Hangeul-mcp@b6fef153714e0cc9ce566df0da4082fc57c4fda4+govbiz-ranges-v3",
    "pdf": "AryanBV/pdf-edit-mcp@d4527e62b59433ad02f31a0511db218a2eeec1d3+govbiz-deletion-proof-v4+pdfbox-v6",
}
KORDOC_VERSION = "chrisryugj/kordoc@f715573df1712d415604ac949603a00e387cd3d7"
PIPELINE_VERSION = hashlib.sha256(json.dumps([CONTRACT, MAP_VERSION, PLAN_VERSION, ENGINES, KORDOC_VERSION], sort_keys=True).encode()).hexdigest()
MAX_BYTES = 32 * 1024 * 1024


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def object_hash(value: object) -> str:
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode())


class DocumentError(RuntimeError):
    def __init__(self, code: str):
        self.code = "APPLICATION_DOCUMENT_" + code
        super().__init__(self.code)


class NativeTarget(Contract):
    targetId: str = Field(min_length=1, max_length=500)
    nativeLocator: dict
    kind: str
    label: str = ""
    currentText: str = Field(max_length=6000)
    context: str = Field(default="", max_length=1000)
    editable: bool = True
    unsupportedReason: str | None = None


class DocumentMap(Contract):
    contractVersion: Literal["application-document-mcp-v1"] = CONTRACT
    sourceSha256: str
    format: Literal["hwp", "hwpx", "pdf"]
    engineVersion: str
    mapVersion: str = MAP_VERSION
    targets: list[NativeTarget] = Field(max_length=3000)
    auxiliaryStatus: str = "SKIPPED_PRIMARY_SUFFICIENT"
    auxiliaryText: str = Field(default="", max_length=40000)


class EditOperation(Contract):
    targetId: str
    operation: Literal["input", "replace_range", "delete_range", "set_field", "set_check"]
    expectedText: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    valueRef: str | None
    box: DocumentBox | None
    reason: str = Field(min_length=1, max_length=1000)
    stylePolicy: Literal["preserve"] = "preserve"


class PlanSelection(Contract):
    operations: list[EditOperation] = Field(max_length=600)
    unresolvedTargets: list[str] = Field(max_length=3000)
    scopeTargetIds: list[str] = Field(max_length=3000)


class WritePlan(PlanSelection):
    sourceSha256: str
    mapVersion: str
    answerRevision: int
    planHash: str


class PdfFieldInfo(Contract):
    targetId: str = Field(min_length=1, max_length=500)
    fieldType: str
    editable: bool
    options: list[str] = Field(default_factory=list, max_length=3000)
    widgets: list[dict] = Field(default_factory=list, max_length=3000)


class GenerateDocumentRequest(Contract):
    contractVersion: Literal["application-document-mcp-v1"] = CONTRACT
    sourceBase64: str = Field(min_length=1, max_length=44_739_244)
    sourceSha256: str = Field(pattern="^[a-f0-9]{64}$")
    format: Literal["hwp", "hwpx", "pdf"]
    answerRevision: int = Field(ge=0)
    facts: list[DocumentFact] = Field(min_length=1, max_length=200)
    scope: str = Field(min_length=1, max_length=30000)
    pdfTargets: list[DocumentTarget] = Field(default_factory=list, max_length=3000)
    pageImages: list[str] = Field(default_factory=list, max_length=50)
    pdfFields: list[PdfFieldInfo] = Field(default_factory=list, max_length=3000)
    bindings: list[DocumentPlacement] = Field(default_factory=list, max_length=600)
    scopeTargetIds: list[str] = Field(default_factory=list, max_length=3000)

    @model_validator(mode="after")
    def validate_source(self):
        data = base64.b64decode(self.sourceBase64, validate=True)
        if not 0 < len(data) <= MAX_BYTES or digest(data) != self.sourceSha256:
            raise ValueError("source hash/size mismatch")
        if len({f.id for f in self.facts}) != len(self.facts):
            raise ValueError("duplicate fact")
        if sum(map(len, self.pageImages)) > MAX_BYTES:
            raise ValueError("image size limit")
        for page in self.pageImages:
            if not base64.b64decode(page, validate=True).startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("invalid image")
        if self.format != "pdf" and (self.pdfTargets or self.pageImages):
            raise ValueError("PDF metadata on another format")
        return self


class DocumentFieldReference(Contract):
    id: str = Field(min_length=1, max_length=129)
    label: str = Field(min_length=1, max_length=210)
    guidance: str = Field(max_length=1000)
    required: bool
    options: list[str] = Field(default_factory=list, max_length=30)


class MapDocumentRequest(GenerateDocumentRequest):
    answerRevision: int = 0
    facts: list[DocumentFact] = Field(default_factory=list, max_length=0)
    fields: list[DocumentFieldReference] = Field(min_length=1, max_length=200)


class MappingSelection(Contract):
    bindings: list[DocumentPlacement] = Field(max_length=600)
    scopeTargetIds: list[str] = Field(max_length=3000)
    unmappedFieldIds: list[str] = Field(max_length=200)


def validate_mapping(request: MapDocumentRequest, document: DocumentMap, selection: MappingSelection):
    fields = {f.id for f in request.fields}
    targets = {t.targetId: t for t in document.targets}
    if len(fields) != len(request.fields) or selection.unmappedFieldIds or {b.factId for b in selection.bindings} != fields:
        raise DocumentError("MAPPING_FAILED")
    if len(selection.scopeTargetIds) != len(set(selection.scopeTargetIds)) or not set(selection.scopeTargetIds) <= targets.keys():
        raise DocumentError("MAPPING_FAILED")
    if document.sourceSha256 != request.sourceSha256 or document.format != request.format or len(targets) != len(document.targets):
        raise DocumentError("SOURCE_CHANGED")
    seen = {}
    for binding in selection.bindings:
        target = targets.get(binding.targetId)
        if target is None or not target.editable or binding.targetId not in selection.scopeTargetIds or target.kind == "PDF_TEXT":
            raise DocumentError("MAPPING_FAILED")
        box = binding.box
        if (box is not None) != (target.kind == "PDF_PAGE"):
            raise DocumentError("MAPPING_FAILED")
        if box and (box.x + box.width > 1 or box.y + box.height > 1):
            raise DocumentError("MAPPING_FAILED")
        for previous in seen.get(binding.targetId, []):
            other = previous.box
            if box is None or other is None or (max(box.x, other.x) < min(box.x + box.width, other.x + other.width) and max(box.y, other.y) < min(box.y + box.height, other.y + other.height)):
                raise DocumentError("MAPPING_FAILED")
        seen.setdefault(binding.targetId, []).append(binding)
    if any(targets[key].nativeLocator.get("parent") in seen for key in seen):
        raise DocumentError("MAPPING_FAILED")


def validate_plan(request: GenerateDocumentRequest, document: DocumentMap, selection: PlanSelection) -> WritePlan:
    if document.sourceSha256 != request.sourceSha256 or document.format != request.format:
        raise DocumentError("SOURCE_CHANGED")
    if selection.unresolvedTargets:
        raise DocumentError("MAPPING_FAILED")
    targets = {t.targetId: t for t in document.targets}
    if len(targets) != len(document.targets):
        raise DocumentError("VALIDATION_FAILED")
    facts = {f.id: f.value for f in request.facts}
    scope = set(selection.scopeTargetIds)
    if not scope <= targets.keys() or len(scope) != len(selection.scopeTargetIds):
        raise DocumentError("MAPPING_FAILED")
    if request.scopeTargetIds and not scope <= set(request.scopeTargetIds):
        raise DocumentError("MAPPING_FAILED")
    used: set[str] = set()
    seen: dict[str, list[EditOperation]] = {}
    for op in selection.operations:
        target = targets.get(op.targetId)
        if target is None or op.targetId not in scope or not target.editable:
            raise DocumentError("MAPPING_FAILED")
        if op.expectedText != target.currentText:
            raise DocumentError("SOURCE_CHANGED")
        if not 0 <= op.start <= op.end <= len(target.currentText):
            raise DocumentError("MAPPING_FAILED")
        if op.operation == "delete_range":
            if op.valueRef is not None or op.start == op.end or op.box is not None:
                raise DocumentError("MAPPING_FAILED")
        else:
            if op.valueRef not in facts:
                raise DocumentError("INPUT_REQUIRED")
            used.add(op.valueRef)
            if request.bindings and not any(b.factId == op.valueRef and b.targetId == op.targetId and b.box == op.box for b in request.bindings):
                raise DocumentError("MAPPING_FAILED")
        if op.operation == "input" and (op.start != op.end or target.currentText.strip()):
            raise DocumentError("MAPPING_FAILED")
        if op.operation == "set_check" and target.kind != "CHECKBOX":
            raise DocumentError("UNSUPPORTED")
        if op.operation == "set_field" and target.kind not in {"HWP_FIELD", "PDF_FIELD", "PDF_PAGE"}:
            raise DocumentError("UNSUPPORTED")
        if (op.box is not None) != (target.kind == "PDF_PAGE" and op.operation == "set_field"):
            raise DocumentError("MAPPING_FAILED")
        if op.box and (op.box.x + op.box.width > 1 or op.box.y + op.box.height > 1):
            raise DocumentError("MAPPING_FAILED")
        for previous in seen.get(op.targetId, []):
            if op.box and previous.box:
                a, b = op.box, previous.box
                if max(a.x, b.x) < min(a.x + a.width, b.x + b.width) and max(a.y, b.y) < min(a.y + a.height, b.y + b.height):
                    raise DocumentError("MAPPING_FAILED")
            elif max(op.start, previous.start) < min(op.end, previous.end) or op.start == previous.start or op.operation.startswith("set_") or previous.operation.startswith("set_"):
                raise DocumentError("MAPPING_FAILED")
        seen.setdefault(op.targetId, []).append(op)
    if request.bindings:
        def identity(field, target, box):
            return (field, target, None if box is None else (box.x, box.y, box.width, box.height))
        expected = {identity(b.factId, b.targetId, b.box) for b in request.bindings if b.factId in facts}
        applied = {identity(op.valueRef, op.targetId, op.box) for op in selection.operations if op.valueRef is not None}
        if applied != expected:
            raise DocumentError("MAPPING_FAILED")
    # A fact can legitimately appear in several official input fields.
    if used != facts.keys():
        raise DocumentError("MAPPING_FAILED")
    for target_id in seen:
        parent = targets[target_id].nativeLocator.get("parent")
        if parent in seen:
            raise DocumentError("MAPPING_FAILED")
    payload = {**selection.model_dump(), "sourceSha256": request.sourceSha256,
               "mapVersion": document.mapVersion, "answerRevision": request.answerRevision}
    return WritePlan(**payload, planHash=object_hash(payload))


def edited_text(target: NativeTarget, operations: list[EditOperation], facts: dict[str, str]) -> str:
    text = target.currentText
    for op in sorted(operations, key=lambda item: item.start, reverse=True):
        value = "" if op.operation == "delete_range" else facts[op.valueRef]
        if op.operation == "set_field":
            text = value
        else:
            text = text[:op.start] + value + text[op.end:]
    return text
