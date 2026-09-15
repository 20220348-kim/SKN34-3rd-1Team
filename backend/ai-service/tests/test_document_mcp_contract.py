import asyncio
import base64
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp_types import CallToolResult

from app.application_preparation.document_contract import (
    DocumentError, DocumentMap, EditOperation, GenerateDocumentRequest, NativeTarget,
    PlanSelection, digest, edited_text, validate_plan,
)
from app.application_preparation.document_mcp import DocumentMcpSession


def request(**updates):
    source = b"synthetic test bytes"
    return GenerateDocumentRequest(**{
        "sourceBase64": base64.b64encode(source).decode(), "sourceSha256": digest(source),
        "format": "hwpx", "answerRevision": 3, "facts": [{"id": "company:name", "label": "회사명", "value": "가상기업"}],
        "scope": "신청서", **updates,
    })


def target(name="t1.r1.c2", text="", **updates):
    return NativeTarget(targetId=name, nativeLocator={"target": name}, kind="cell", currentText=text, **updates)


def operation(name="t1.r1.c2", **updates):
    return EditOperation(**{"targetId": name, "operation": "input", "expectedText": "", "start": 0, "end": 0,
                            "valueRef": "company:name", "box": None, "reason": "회사명 항목 오른쪽의 빈 입력란", **updates})


def validated(targets=None, operations=None, **updates):
    req = request()
    targets = targets or [target()]
    document = DocumentMap(sourceSha256=req.sourceSha256, format="hwpx", engineVersion="test", targets=targets)
    selection = PlanSelection(operations=operations or [operation()], unresolvedTargets=[], scopeTargetIds=[t.targetId for t in targets], **updates)
    return validate_plan(req, document, selection)


def test_same_fact_can_fill_multiple_verified_targets():
    plan = validated([target(), target("t2.r1.c2")], [operation(), operation("t2.r1.c2")])
    assert len(plan.operations) == 2
    assert len(plan.planHash) == 64
    assert plan.answerRevision == 3


@pytest.mark.parametrize("change", [
    {"targetId": "absent"}, {"expectedText": "changed"}, {"valueRef": "invented"},
    {"start": 1, "end": 2}, {"operation": "set_check"},
])
def test_rejects_unbound_or_invalid_operations(change):
    with pytest.raises(DocumentError):
        validated(operations=[operation(**change)])


def test_rejects_duplicate_and_parent_child_edits():
    with pytest.raises(DocumentError):
        validated(operations=[operation(), operation()])
    child = target("t1.r1.c2.p1")
    child.nativeLocator["parent"] = "t1.r1.c2"
    with pytest.raises(DocumentError):
        validated([target(), child], [operation(), operation(child.targetId)])


@pytest.mark.parametrize("color", ["blue", "black", "gray"])
def test_example_range_preserves_label_independently_of_color(color):
    text = "회사명: 예시 주식회사 (필수 고지 유지)"
    item = target(text=text, context=f"color={color}")
    start = text.index("예시")
    end = text.index(" (필수")
    op = operation(operation="replace_range", expectedText=text, start=start, end=end)
    validated([item], [op])
    assert edited_text(item, [op], {"company:name": "가상기업"}) == "회사명: 가상기업 (필수 고지 유지)"


def test_unanswered_example_can_be_deleted_without_inventing_a_fact():
    example = target("t1.r2.c2", "예: 매출 100억원")
    deletion = operation(example.targetId, operation="delete_range", expectedText=example.currentText,
                         start=0, end=len(example.currentText), valueRef=None)
    validated([target(), example], [operation(), deletion])
    assert edited_text(example, [deletion], {}) == ""


def test_nonempty_input_and_unsupported_regions_fail_closed():
    with pytest.raises(DocumentError):
        validated([target(text="필수 고지")], [operation(expectedText="필수 고지")])
    with pytest.raises(DocumentError):
        validated([target(editable=False, unsupportedReason="nested_table")])


def test_hash_and_fact_identity_are_checked_before_tools():
    with pytest.raises(ValueError):
        request(sourceSha256="0" * 64)
    with pytest.raises(ValueError):
        request(facts=[{"id": "same", "label": "회사", "value": "0"}] * 2)


def test_kordoc_write_tool_never_reaches_mcp_session():
    class ForbiddenSession:
        async def call_tool(self, *args):
            pytest.fail("write was forwarded")
    session = DocumentMcpSession("kordoc", ForbiddenSession(), {"patch_document": {}})
    with pytest.raises(DocumentError):
        asyncio.run(session.call("patch_document", {}))


@pytest.mark.parametrize("payload", [{"success": False}, {"ok": False}, {"available": False}, {"error": "partial failure"}])
def test_transport_success_does_not_hide_business_failure(payload):
    class Session:
        async def call_tool(self, *args):
            return CallToolResult(is_error=False, structured_content=payload, content=[])
    session = DocumentMcpSession("pdf", Session(), {"pdf_get_text": {}})
    with pytest.raises(DocumentError):
        asyncio.run(session.call("pdf_get_text", {}))


def test_bridge_authentication_precedes_body_and_job_creation(monkeypatch, tmp_path):
    from app.application_preparation.windows_bridge import app
    monkeypatch.setenv("DOCUMENT_HWP_BRIDGE_TOKEN", "t" * 32)
    root = tmp_path / "jobs"
    monkeypatch.setenv("DOCUMENT_HWP_WORK_ROOT", str(root))
    with TestClient(app) as client:
        response = client.post("/internal/v1/document-job", content=b"invalid JSON")
    assert response.status_code == 401
    assert not root.exists()


def test_bridge_unknown_result_blocks_next_job_and_preserves_lock(monkeypatch, tmp_path):
    from app.application_preparation import windows_bridge
    @asynccontextmanager
    async def failed(*args):
        raise DocumentError("OUTCOME_UNKNOWN")
        yield
    monkeypatch.setattr(windows_bridge, "document_session", failed)
    monkeypatch.setenv("DOCUMENT_HWP_BRIDGE_TOKEN", "t" * 32)
    monkeypatch.setenv("DOCUMENT_HWP_WORK_ROOT", str(tmp_path))
    source = bytes.fromhex("d0cf11e0a1b11ae1") + b"synthetic"
    payload = {"operation": "inspect", "sourceBase64": base64.b64encode(source).decode(), "sourceSha256": digest(source)}
    with TestClient(windows_bridge.app) as client:
        headers = {"Authorization": "Bearer " + "t" * 32}
        assert client.post("/internal/v1/document-job", json=payload, headers=headers).status_code == 503
        assert client.post("/internal/v1/document-job", json=payload, headers=headers).status_code == 409
    assert (tmp_path / "executor.lock").exists()
    assert not list(tmp_path.glob("job-*"))


def test_generate_endpoint_requires_internal_auth(monkeypatch):
    from app.application_preparation.router import router, get_service
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_service] = lambda: SimpleNamespace(agent=None)
    monkeypatch.setenv("DOCUMENT_INTERNAL_TOKEN", "t" * 32)
    with TestClient(app) as client:
        response = client.post("/internal/v1/application-preparations/document/generate", content=b"invalid JSON")
    assert response.status_code == 401


def test_hangeul_fastmcp_envelope_cannot_hide_failure():
    class Session:
        async def call_tool(self, *args):
            return CallToolResult(is_error=False, structured_content={"result": {"available": True, "ok": False, "error": "failed"}}, content=[])
    session = DocumentMcpSession("hwpx", Session(), {"inspect_editable_regions": {}})
    with pytest.raises(DocumentError):
        asyncio.run(session.call("inspect_editable_regions", {}))


@pytest.mark.parametrize("run", ['<hp:run charPrIDRef="33"/>', '<hp:run charPrIDRef="33"><hp:t/></hp:run>'])
def test_empty_run_extension_keeps_style_and_escapes_text(run):
    from app.application_preparation.hwpx_mcp_extension import fill_empty_run
    xml = '<hp:p id="7">' + run + '</hp:p>'
    result = fill_empty_run(xml, '가상 & 연구소 <검증>')
    assert 'charPrIDRef="33"' in result
    assert '가상 &amp; 연구소 &lt;검증&gt;' in result
    assert 'id="7"' in result


@pytest.mark.parametrize("unsafe", ['<hp:pic/>', '<hp:ctrl/>', '<hp:tbl/>', '<hp:t>보존 고지</hp:t>'])
def test_empty_run_extension_refuses_controls_or_existing_content(unsafe):
    from app.application_preparation.hwpx_mcp_extension import fill_empty_run
    assert fill_empty_run('<hp:p><hp:run charPrIDRef="33"/>' + unsafe + '</hp:p>', '가상기업') is None


def test_question_mapping_contains_no_answers_and_rejects_shared_targets():
    from app.application_preparation.document_contract import MapDocumentRequest, MappingSelection, validate_mapping
    from app.application_preparation.document import DocumentPlacement
    base = request().model_dump(exclude={"facts"})
    mapping = MapDocumentRequest(**base, fields=[{"id": "company:name", "label": "기업명", "guidance": "정확한 상호", "required": True}])
    assert mapping.facts == []
    assert "value" not in mapping.fields[0].model_dump()
    document = DocumentMap(sourceSha256=mapping.sourceSha256, format="hwpx", engineVersion="test", targets=[target()])
    binding = DocumentPlacement(factId="company:name", targetId="t1.r1.c2", box=None)
    validate_mapping(mapping, document, MappingSelection(bindings=[binding], scopeTargetIds=["t1.r1.c2"], unmappedFieldIds=[]))
    with pytest.raises(DocumentError):
        validate_mapping(mapping, document, MappingSelection(bindings=[binding, binding], scopeTargetIds=["t1.r1.c2"], unmappedFieldIds=[]))


def test_generation_cannot_move_a_field_bound_before_questions():
    from app.application_preparation.document import DocumentPlacement
    req = request(bindings=[DocumentPlacement(factId="company:name", targetId="t1.r1.c2", box=None)], scopeTargetIds=["t1.r1.c2", "t1.r2.c2"])
    document = DocumentMap(sourceSha256=req.sourceSha256, format="hwpx", engineVersion="test", targets=[target(), target("t1.r2.c2")])
    with pytest.raises(DocumentError):
        validate_plan(req, document, PlanSelection(operations=[operation("t1.r2.c2")], scopeTargetIds=req.scopeTargetIds, unresolvedTargets=[]))


def test_range_replacement_keeps_the_label_and_notice_in_their_original_runs():
    from app.application_preparation.hwpx_mcp_extension import replace_plain_text_runs
    xml = '<hp:p><hp:run charPrIDRef="1"><hp:t>기업명: </hp:t></hp:run><hp:run charPrIDRef="2"><hp:t>예시 회사</hp:t></hp:run><hp:run charPrIDRef="3"><hp:t> / 필수 고지</hp:t></hp:run></hp:p>'
    result = replace_plain_text_runs(xml, '기업명: 가상기업 / 필수 고지')
    assert result == xml.replace('<hp:t>예시 회사</hp:t>', '<hp:t>가상기업</hp:t>')
    assert replace_plain_text_runs('<hp:p><hp:run><hp:t>예시예시</hp:t></hp:run></hp:p>', '예시') is None


def test_running_windows_job_is_busy_without_becoming_an_unknown_outcome(monkeypatch, tmp_path):
    import httpx
    from app.application_preparation import windows_bridge
    async def scenario():
        started, release = asyncio.Event(), asyncio.Event()
        class Session:
            async def call(self, *args):
                started.set()
                await release.wait()
                return {"success": True}
        @asynccontextmanager
        async def running(*args):
            yield Session()
        monkeypatch.setattr(windows_bridge, "document_session", running)
        monkeypatch.setenv("DOCUMENT_HWP_BRIDGE_TOKEN", "t" * 32)
        monkeypatch.setenv("DOCUMENT_HWP_WORK_ROOT", str(tmp_path))
        data = bytes.fromhex("d0cf11e0a1b11ae1") + b"fixture"
        payload = {"operation": "inspect", "sourceBase64": base64.b64encode(data).decode(), "sourceSha256": digest(data)}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=windows_bridge.app), base_url="http://bridge.test", headers={"Authorization": "Bearer " + "t" * 32}) as client:
            first = asyncio.create_task(client.post("/internal/v1/document-job", json=payload))
            await started.wait()
            second = await client.post("/internal/v1/document-job", json=payload)
            assert second.status_code == 409
            assert second.json()["detail"]["code"] == "APPLICATION_DOCUMENT_RUN_CONFLICT"
            release.set()
            assert (await first).status_code == 200
        assert not (tmp_path / "executor.lock").exists()
    asyncio.run(scenario())
