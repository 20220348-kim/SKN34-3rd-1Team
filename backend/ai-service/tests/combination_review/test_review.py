import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from agents.testing import ScriptedModel, assistant_message
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.combination_review.agent import CombinationReviewAgent
from app.combination_review.models import AnalyzeRequest, AnalysisSelection, build_citation_options, validate_selection
from app.combination_review.prompt import PROMPT_VERSION
from app.combination_review.service import CombinationReviewError, CombinationReviewService
from app.config import Settings
from app.main import create_app

FIXTURES = (Path(os.environ["GOVBIZ_TEST_CONTRACT_DIR"]) if "GOVBIZ_TEST_CONTRACT_DIR" in os.environ
            else Path(__file__).resolve().parents[4] / "backend/core-api/src/test/resources/combinationreview")


def request_data():
    return json.loads((FIXTURES / "contract-request.json").read_text(encoding="utf-8"))


def response_data():
    data = json.loads((FIXTURES / "contract-response.json").read_text(encoding="utf-8"))
    data["promptVersion"] = PROMPT_VERSION
    return data


def selection_data():
    request = AnalyzeRequest.model_validate(request_data())
    options = build_citation_options(request)
    data = response_data()
    for name in ["contractVersion", "model", "promptVersion"]:
        data.pop(name)
    for pair in data["pairs"]:
        for stage in pair["stages"]:
            for citation in stage["citations"]:
                evidence_index = int(citation.pop("evidenceId")[1:])
                quote = citation.pop("quote")
                citation["citationOptionIndex"] = next(
                    index for index, option in enumerate(options)
                    if option.evidenceIndex == evidence_index and quote in option.quote
                )
    return data


def make_service(data=None):
    model = ScriptedModel([[assistant_message(json.dumps(data or selection_data(), ensure_ascii=False))]])
    agent = CombinationReviewAgent(model=model, model_timeout_seconds=2, run_timeout_seconds=3)
    return CombinationReviewService(agent, "test-model"), model


def test_real_runner_returns_the_same_contract_consumed_by_core():
    service, model = make_service()
    result = asyncio.run(service.analyze(AnalyzeRequest.model_validate(request_data())))
    assert result == response_data()
    assert result["promptVersion"] == PROMPT_VERSION
    assert len(model.calls) == 1
    assert service.agent._agent.tools == []
    assert service.agent._agent.model_settings.store is False
    assert service.agent._agent.model_settings.extra_args == {"timeout": 2}
    assert service.agent._run_timeout_seconds == 3
    assert service.agent._run_config.tracing_disabled is True


@pytest.mark.parametrize("change", [
    lambda d: d["programs"].append(deepcopy(d["programs"][0])),
    lambda d: d["evidence"][0].update(programIndex=2),
    lambda d: d["evidence"][0].update(programIndex="0"),
    lambda d: d["evidence"][1].update(id="E0"),
    lambda d: d["evidence"].pop(),
    lambda d: d["programs"][0]["participation"].update(selected=None),
    lambda d: d["programs"][0]["participation"].update(selected="MAYBE"),
    lambda d: d.update(evidence=[]),
    lambda d: d.update(contractVersion="unknown"),
])
def test_invalid_inputs_are_rejected_before_agent(change):
    data = request_data()
    change(data)
    with pytest.raises(ValidationError):
        AnalyzeRequest.model_validate(data)


@pytest.mark.parametrize("change", [
    lambda d: d["pairs"][0]["stages"][0].update(citations=[]),
    lambda d: d["pairs"][0]["stages"][0].update(requiresInstitutionConfirmation=True),
    lambda d: d["pairs"][0]["stages"][0].update(judgment="NEEDS_FACTS", questions=[]),
    lambda d: d["pairs"][0]["stages"].pop(),
    lambda d: d["pairs"].append(deepcopy(d["pairs"][0])),
    lambda d: d["pairs"][0].update(secondProgramIndex=2),
])
def test_invalid_outputs_fail_the_structured_contract(change):
    data = selection_data()
    change(data)
    with pytest.raises(ValidationError):
        AnalysisSelection.model_validate(data)


@pytest.mark.parametrize("change", [
    lambda d: d["pairs"][0]["stages"][0].update(stage="FUNDING"),
    lambda d: d["pairs"][0]["stages"][0]["citations"][0].update(citationOptionIndex=500),
])
def test_invalid_pair_or_citation_is_technical_failure_without_fallback(change):
    data = selection_data()
    change(data)
    agent = SimpleNamespace(analyze=AsyncMock(return_value=AnalysisSelection.model_validate(data)))
    service = CombinationReviewService(agent, "test-model")
    with pytest.raises(CombinationReviewError, match="COMBINATION_REVIEW_FAILED"):
        asyncio.run(service.analyze(AnalyzeRequest.model_validate(request_data())))
    assert agent.analyze.call_count == 1


def test_returns_the_prebuilt_exact_source_quote_selected_by_the_model():
    request = request_data()
    request["evidence"][0]["text"] = "3개\u3000유형에  중복\n신청은 가능하나 1개 유형만 수행 가능합니다."
    data = selection_data()
    for stage in data["pairs"][0]["stages"]:
        for citation in stage["citations"]:
            citation["citationOptionIndex"] = 0
    agent = SimpleNamespace(analyze=AsyncMock(return_value=AnalysisSelection.model_validate(data)))

    result = asyncio.run(CombinationReviewService(agent, "test-model").analyze(AnalyzeRequest.model_validate(request)))

    assert all(
        citation["quote"] == request["evidence"][0]["text"]
        for stage in result["pairs"][0]["stages"]
        for citation in stage["citations"]
    )


def test_a_third_program_is_rejected_before_pair_analysis():
    request = request_data()
    program = deepcopy(request["programs"][0])
    program["sourceProgramId"] = "PBLN_3"
    request["programs"].append(program)
    request["evidence"].append({**request["evidence"][0], "id":"E2", "programIndex":2})
    with pytest.raises(ValidationError):
        AnalyzeRequest.model_validate(request)


def test_too_large_context_rejected_without_model_call(monkeypatch):
    import app.combination_review.service as module
    monkeypatch.setattr(module.tiktoken, "get_encoding", lambda _: SimpleNamespace(encode=lambda *a, **kw: [0]*100001))
    agent = SimpleNamespace(analyze=AsyncMock())
    with pytest.raises(CombinationReviewError, match="CONTEXT_TOO_LARGE"):
        asyncio.run(CombinationReviewService(agent, "test-model").analyze(AnalyzeRequest.model_validate(request_data())))
    agent.analyze.assert_not_called()


def test_timeout_is_distinguished_from_a_normal_insufficient_evidence_answer():
    agent = SimpleNamespace(analyze=AsyncMock(side_effect=TimeoutError()))
    with pytest.raises(CombinationReviewError, match="COMBINATION_REVIEW_TIMEOUT"):
        asyncio.run(CombinationReviewService(agent, "test-model").analyze(AnalyzeRequest.model_validate(request_data())))


def test_execution_failure_is_not_a_normal_insufficient_evidence_answer():
    agent = SimpleNamespace(analyze=AsyncMock(side_effect=RuntimeError("private upstream detail")))
    with pytest.raises(CombinationReviewError, match="COMBINATION_REVIEW_FAILED"):
        asyncio.run(CombinationReviewService(agent, "test-model").analyze(AnalyzeRequest.model_validate(request_data())))


def test_fastapi_contract_and_generic_failure_response():
    app = create_app(settings=Settings(openai_api_key="unused-test-key", openai_model="test-model",
                                       llm_model_timeout_seconds=2, llm_run_timeout_seconds=3))
    service, _ = make_service()
    app.state.container.combination_review_service = service
    with TestClient(app) as client:
        config = client.get("/internal/v1/combination-reviews/configuration")
        assert config.status_code == 200
        assert config.json() == service.configuration()
        result = client.post("/internal/v1/combination-reviews/analyze", json=request_data())
        assert result.status_code == 200
        assert result.json() == response_data()
        assert client.post("/internal/v1/combination-reviews/analyze", json={}).status_code == 422
        service.agent = SimpleNamespace(analyze=AsyncMock(side_effect=RuntimeError("secret-detail")))
        failure = client.post("/internal/v1/combination-reviews/analyze", json=request_data())
        assert failure.status_code == 503
        assert failure.json() == {"detail":{"code":"COMBINATION_REVIEW_FAILED"}}
        assert "secret-detail" not in failure.text


def test_fastapi_timeout_response_and_safe_diagnostic_log(caplog):
    app = create_app(settings=Settings(openai_api_key="unused-test-key", openai_model="test-model",
                                       llm_model_timeout_seconds=2, llm_run_timeout_seconds=3))
    service, _ = make_service()
    service.agent = SimpleNamespace(analyze=AsyncMock(side_effect=TimeoutError("private-timeout-detail")))
    app.state.container.combination_review_service = service
    caplog.set_level("WARNING", logger="app.combination_review.router")

    with TestClient(app) as client:
        failure = client.post("/internal/v1/combination-reviews/analyze", json=request_data())

    assert failure.status_code == 504
    assert failure.json() == {"detail": {"code": "COMBINATION_REVIEW_TIMEOUT"}}
    assert "failure_kind=timeout" in caplog.text
    assert "failure_reason=upstream_or_schema" in caplog.text
    assert "error_type=TimeoutError" in caplog.text
    assert "program_count=2" in caplog.text
    assert "evidence_count=2" in caplog.text
    assert "private-timeout-detail" not in caplog.text
