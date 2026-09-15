"""Fixed MCP extension using the selected Topabaem05 COM controller.

No tool accepts arbitrary COM actions. Native numbered fields are supported; the
upstream filtered paragraph ordinal is deliberately never treated as a COM address.
"""
import base64
from pathlib import Path
import sys

from mcp.server.fastmcp import FastMCP

from app.application_preparation.document_contract import DocumentMap, ENGINES, NativeTarget, WritePlan, digest, edited_text, object_hash, MAX_BYTES

mcp = FastMCP("GovBiz-Topabaem05-HWP")


@mcp.tool()
async def govbiz_hwp_job(operation: str, source_path: str, source_sha256: str, plan: dict | None = None, facts: dict[str, str] | None = None) -> dict:
    if sys.platform != "win32":
        return {"success": False, "error": "WINDOWS_REQUIRED"}
    import pythoncom
    import win32com.client
    from hwpx_mcp.tools.windows_hwp_controller import WindowsHwpController

    path = Path(source_path)
    if operation not in {"inspect", "apply"} or path.is_symlink() or path.resolve().parent != Path.cwd().resolve() or digest(path.read_bytes()) != source_sha256:
        return {"success": False, "error": "INVALID_JOB"}
    pythoncom.CoInitialize()
    controller = None
    try:
        # The upstream constructor uses Dispatch and can attach to an existing window.
        # Supply a fresh COM object and initialize its documented instance state instead.
        controller = WindowsHwpController.__new__(WindowsHwpController)
        controller.hwp = win32com.client.DispatchEx("HWPFrame.HwpObject")
        controller._is_hwp_running = True
        controller._is_document_open = False
        controller.visible = False
        controller.current_document_path = None
        controller.connect(visible=False, register_security_module=False)
        if not controller.hwp.Open(str(path), "HWP", ""):
            return {"success": False, "error": "OPEN_FAILED"}
        controller._is_document_open = True
        names = [name for name in controller.hwp.GetFieldList(1, 0).split("\x02") if name]
        if not names or len(names) != len(set(names)) or len(names) > 3000:
            return {"success": False, "error": "NATIVE_FIELDS_UNAVAILABLE"}
        targets = [NativeTarget(targetId=name, nativeLocator={"field": name}, kind="HWP_FIELD", label=name,
                                currentText=controller.get_field_text(name), context="Named native field: " + name) for name in names]
        document = DocumentMap(sourceSha256=source_sha256, format="hwp", engineVersion=ENGINES["hwp"], targets=targets)
        if operation == "inspect":
            return {"success": True, "documentMap": document.model_dump()}
        parsed = WritePlan.model_validate(plan)
        if parsed.sourceSha256 != source_sha256 or parsed.unresolvedTargets or parsed.planHash != object_hash(parsed.model_dump(exclude={"planHash"})):
            return {"success": False, "error": "STALE_PLAN"}
        grouped = {}
        for op in parsed.operations:
            if op.targetId not in names or op.operation not in {"set_field", "replace_range", "delete_range", "input"}:
                return {"success": False, "error": "UNSUPPORTED_NATIVE_TARGET"}
            target = next(t for t in targets if t.targetId == op.targetId)
            if op.expectedText != target.currentText or not 0 <= op.start <= op.end <= len(target.currentText):
                return {"success": False, "error": "EXPECTED_TEXT_MISMATCH"}
            grouped.setdefault(op.targetId, []).append(op)
        expected = {name: edited_text(next(t for t in targets if t.targetId == name), ops, facts or {}) for name, ops in grouped.items()}
        for name, value in expected.items():
            if not controller.put_field_text(name, value) or controller.get_field_text(name).replace("\r\n", "\n") != value.replace("\r\n", "\n"):
                return {"success": False, "error": "FIELD_VERIFICATION_FAILED"}
        output = path.parent / "completed.hwp"
        if not controller.hwp.SaveAs(str(output), "HWP", ""):
            return {"success": False, "error": "SAVE_FAILED"}
        if not controller.close_document() or not controller.hwp.Open(str(output), "HWP", ""):
            return {"success": False, "error": "REOPEN_FAILED"}
        controller._is_document_open = True
        if any(controller.get_field_text(name).replace("\r\n", "\n") != value.replace("\r\n", "\n") for name, value in expected.items()):
            return {"success": False, "error": "REOPEN_VALUE_MISMATCH"}
        if not 0 < output.stat().st_size <= MAX_BYTES:
            return {"success": False, "error": "OUTPUT_SIZE_LIMIT"}
        data = output.read_bytes()
        if not data.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
            return {"success": False, "error": "FORMAT_MISMATCH"}
        return {"success": True, "outputBase64": base64.b64encode(data).decode(), "outputSha256": digest(data),
                "verification": {"verified": len(expected), "unresolved": 0, "reopened": True, "render": "NOT_RUN"}}
    except Exception:
        return {"success": False, "error": "COM_JOB_FAILED"}
    finally:
        try:
            if controller is not None:
                closed = controller.close_document()
                controller.quit()
                if not closed or controller.hwp is not None:
                    raise RuntimeError("COM_CLEANUP_UNKNOWN")
        finally:
            pythoncom.CoUninitialize()


if __name__ == "__main__":
    mcp.run(transport="stdio")
