"""Short-lived, allowlisted stdio MCP sessions; never an externally callable proxy."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from jsonschema import validate

from app.application_preparation.document_contract import DocumentError

logger = logging.getLogger(__name__)
ALLOWED = {
    "hwpx": frozenset({"inspect_editable_regions", "preview_addressed_edits", "apply_addressed_edits", "verify_targets", "govbiz_verify_hwpx_edits"}),
    "pdf": frozenset({"pdf_get_text", "pdf_get_text_layout", "pdf_detect_paragraphs", "pdf_find_text", "pdf_replace_single", "pdf_extract_bbox_text", "govbiz_verify_pdf_deletion"}),
    "hwp": frozenset({"govbiz_hwp_job"}),
    "kordoc": frozenset({"parse_document"}),
}


class DocumentMcpSession:
    def __init__(self, kind: str, session: ClientSession, schemas: dict):
        self.kind, self.session, self.schemas = kind, session, schemas

    async def call(self, name: str, arguments: dict) -> dict:
        if name not in ALLOWED[self.kind] or name not in self.schemas:
            raise DocumentError("MCP_NOT_READY")
        validate(arguments, self.schemas[name])
        result = await self.session.call_tool(name, arguments)
        if result.is_error:
            if self.kind == "hwpx" and any(c.type == "text" and "GOVBIZ_UNSUPPORTED_STYLE_RANGE" in c.text for c in result.content):
                raise DocumentError("UNSUPPORTED")
            raise DocumentError("MCP_FAILED")
        payload = result.structured_content
        if payload is None:
            text = "\n".join(c.text for c in result.content if c.type == "text")
            if len(text) > 4_000_000:
                raise DocumentError("LIMIT_EXCEEDED")
            if self.kind == "kordoc":
                return {"text": text}
            try:
                payload = json.loads(text)
            except (ValueError, TypeError) as error:
                raise DocumentError("MCP_FAILED") from error
        if payload is not None and len(json.dumps(payload, ensure_ascii=False)) > 4_000_000:
            raise DocumentError("LIMIT_EXCEEDED")
        # Hangeul's decorated Dict[str, Any] is wrapped as result by pinned FastMCP 1.27.2.
        if self.kind in {"hwpx", "hwp"} and isinstance(payload, dict) and set(payload) == {"result"}:
            payload = payload["result"]
        if self.kind == "hwp" and isinstance(payload, dict) and payload.get("error") == "NATIVE_FIELDS_UNAVAILABLE":
            raise DocumentError("UNSUPPORTED")
        if not isinstance(payload, dict) or any(payload.get(k) is False for k in ("ok", "success", "available")) or payload.get("error"):
            raise DocumentError("MCP_FAILED")
        return payload


@asynccontextmanager
async def document_session(kind: str, directory: Path):
    command = os.getenv(f"DOCUMENT_{kind.upper()}_COMMAND", "")
    if not command:
        raise DocumentError("MCP_NOT_READY")
    args = json.loads(os.getenv(f"DOCUMENT_{kind.upper()}_ARGS", "[]"))
    if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
        raise DocumentError("MCP_NOT_READY")
    # No OpenAI credentials, bridge token, user-supplied paths or environment in children.
    env = {k: v for k, v in os.environ.items() if k in {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"}}
    env.update({"HOME": str(directory), "USERPROFILE": str(directory), "TMP": str(directory), "TEMP": str(directory), "TMPDIR": str(directory), "PYTHONIOENCODING": "utf-8"})
    parameters = StdioServerParameters(command=command, args=args, cwd=str(directory), env=env)
    try:
        # Upstream stderr can contain complete document text. Discard it; log fixed metadata only.
        with open(os.devnull, "w") as stderr:
            async with asyncio.timeout(120):
                async with stdio_client(parameters, errlog=stderr) as (read, write):
                    async with ClientSession(read, write, read_timeout_seconds=100.0) as session:
                        await session.initialize()
                        listing = await session.list_tools()
                        schemas = {t.name: t.input_schema for t in listing.tools}
                        if not ALLOWED[kind] <= schemas.keys():
                            raise DocumentError("MCP_NOT_READY")
                        yield DocumentMcpSession(kind, session, schemas)
    except DocumentError:
        raise
    except BaseException as error:
        if isinstance(error, asyncio.CancelledError):
            raise
        def document_error(item):
            if isinstance(item, DocumentError):
                return item
            for child in getattr(item, "exceptions", []):
                found = document_error(child)
                if found is not None:
                    return found
            return None
        known = document_error(error)
        if known is not None:
            raise known from None
        logger.warning("document_mcp_failed engine=%s type=%s", kind, type(error).__name__)
        raise DocumentError("OUTCOME_UNKNOWN" if kind == "hwp" else "MCP_FAILED") from error
