"""Private single-worker file bridge. Authorization is checked before reading a body."""
import asyncio
import base64
import hmac
import json
import os
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException, Request

from app.application_preparation.document_contract import DocumentError, MAX_BYTES, digest
from app.application_preparation.document_mcp import document_session

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_active_job: str | None = None


@app.post("/internal/v1/document-job")
async def document_job(request: Request):
    global _active_job
    secret = os.getenv("DOCUMENT_HWP_BRIDGE_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, detail={"code": "APPLICATION_DOCUMENT_MCP_NOT_READY"})
    if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + secret):
        raise HTTPException(401, detail={"code": "UNAUTHORIZED"})
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 48 * 1024 * 1024:
            raise HTTPException(413, detail={"code": "APPLICATION_DOCUMENT_LIMIT_EXCEEDED"})
    try:
        payload = json.loads(body)
        if set(payload) - {"operation", "sourceBase64", "sourceSha256", "plan", "facts"} or payload["operation"] not in {"inspect", "apply"}:
            raise ValueError()
        data = base64.b64decode(payload["sourceBase64"], validate=True)
        if not 0 < len(data) <= MAX_BYTES or digest(data) != payload["sourceSha256"] or not data.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise HTTPException(422, detail={"code": "APPLICATION_DOCUMENT_VALIDATION_FAILED"}) from None
    root = Path(os.environ["DOCUMENT_HWP_WORK_ROOT"]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    # Cross-process and restart-safe exclusion. Unknown outcomes deliberately retain this marker.
    guard = root / "executor.lock"
    try:
        fd = os.open(guard, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        try:
            marker = json.loads(guard.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            marker = {}
        busy = marker.get("state") == "RUNNING" and marker.get("pid") == os.getpid() and marker.get("jobId") == _active_job and _active_job is not None
        raise HTTPException(409, detail={"code": "APPLICATION_DOCUMENT_RUN_CONFLICT" if busy else "APPLICATION_DOCUMENT_OUTCOME_UNKNOWN"}) from None
    job_id = uuid.uuid4().hex
    marker = {"state": "RUNNING", "pid": os.getpid(), "jobId": job_id}
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(marker, handle)
    _active_job = job_id
    complete = False
    try:
        with TemporaryDirectory(prefix="job-", dir=root) as directory:
            work = Path(directory).resolve()
            source = work / "source.hwp"
            source.write_bytes(data)
            async with document_session("hwp", work) as session:
                result = await session.call("govbiz_hwp_job", {"operation": payload["operation"], "source_path": str(source),
                    "source_sha256": payload["sourceSha256"], "plan": payload.get("plan"), "facts": payload.get("facts", {})})
            if source.read_bytes() != data:
                raise DocumentError("VALIDATION_FAILED")
            complete = True
            return result
    except DocumentError as error:
        # Known unsupported input is returned only after the worker closes its owned COM instance.
        complete = error.code == "APPLICATION_DOCUMENT_UNSUPPORTED"
        raise HTTPException(503, detail={"code": error.code if complete else "APPLICATION_DOCUMENT_OUTCOME_UNKNOWN"}) from None
    except asyncio.CancelledError:
        raise
    except Exception:
        complete = False
        raise HTTPException(503, detail={"code": "APPLICATION_DOCUMENT_OUTCOME_UNKNOWN"}) from None
    finally:
        _active_job = None
        if complete:
            guard.unlink()
        else:
            marker["state"] = "OUTCOME_UNKNOWN"
            guard.write_text(json.dumps(marker), encoding="utf-8")
