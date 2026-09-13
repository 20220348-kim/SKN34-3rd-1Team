import json
from dataclasses import replace

import pytest
from agents.testing import ScriptedModel, assistant_message
from fastapi.testclient import TestClient

import app.bootstrap as bootstrap_module
import app.main as main_module
from app.support_program_ranking.agent import SupportProgramRecommendationAgent
from app.support_program_ranking.models import (
    SCORING_VERSION,
    AssessedSupportProgram,
    SupportProgramCandidate,
    SupportProgramRankingOutput,
    SupportProgramRankingRequest,
)
from app.support_program_ranking.service import SupportProgramRankingService
from app.support_program_evidence.answer_service import SupportProgramEvidenceAnswerService
from app.support_program_evidence.service import SupportProgramEvidenceService
from app.bootstrap import ApplicationContainer, build_application_container
from app.config import Settings
from app.support_program_conversation.service import SupportProgramConversationService
from app.application_preparation.service import ApplicationPreparationService


OPENAI_SETTINGS = Settings(
    openai_api_key="private-key",
    openai_model="test-model",
    llm_model_timeout_seconds=1.25,
    llm_run_timeout_seconds=1.75,
)


class FakeOpenAIClient:
    def __init__(self) -> None:
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class NeverCalledAgent(SupportProgramRecommendationAgent):
    def __init__(self) -> None:
        pass

    async def rank(
        self,
        request: SupportProgramRankingRequest,
    ) -> SupportProgramRankingOutput:
        raise AssertionError("health and lifespan tests must not invoke the agent")


@pytest.mark.anyio
async def test_builds_and_wires_agent_in_the_composition_root(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_client_arguments: dict[str, object] = {}
    captured_model_arguments: dict[str, object] = {}
    captured_models: list[str] = []
    client = FakeOpenAIClient()
    expected = SupportProgramRankingOutput(
        rankings=[
            AssessedSupportProgram(
                programId="BIZINFO:program-1",
                semanticRelevance=40,
                targetAssessment={"eligibility": "MATCH",
                                  "evidence": [{"field": "TARGET_DESCRIPTION", "quote": "중소기업"}],
                                  "explanation": "기업 대상 근거"},
                regionAssessment={"eligibility": "MATCH",
                                  "evidence": [{"field": "SUMMARY", "quote": "반도체 지원"}],
                                  "explanation": "지역 조건 근거"},
                supportTypeFit=10,
                recommendationReasons=["질의와 직접 관련"],
            )
        ]
    )
    selections = {"rankings": {
        assessment.program_id: assessment.model_dump(by_alias=True, exclude={"program_id"})
        for assessment in expected.rankings
    }}
    for assessment in selections["rankings"].values():
        assessment["targetAssessment"]["evidence"] = [1]
        assessment["regionAssessment"]["evidence"] = [0]
    model = ScriptedModel([[assistant_message(json.dumps(selections, ensure_ascii=False))]])

    def fake_openai_client(**arguments: object) -> FakeOpenAIClient:
        captured_client_arguments.update(arguments)
        return client

    def fake_responses_model(**arguments: object) -> ScriptedModel:
        captured_model_arguments.update(arguments)
        captured_models.append(str(arguments["model"]))
        return model

    monkeypatch.setattr(bootstrap_module, "AsyncOpenAI", fake_openai_client)
    monkeypatch.setattr(
        bootstrap_module,
        "OpenAIResponsesModel",
        fake_responses_model,
    )

    container = build_application_container(OPENAI_SETTINGS)

    assert isinstance(
        container.support_program_ranking_service,
        SupportProgramRankingService,
    )
    assert container.support_program_index_service is not None
    assert container.support_program_index_service.openai_client is client
    assert container.support_program_index_service.qdrant_client is container.qdrant_client
    assert isinstance(
        container.support_program_evidence_service,
        SupportProgramEvidenceService,
    )
    assert container.support_program_evidence_service.openai_client is client
    assert container.support_program_evidence_service.qdrant_client is container.qdrant_client
    assert isinstance(
        container.support_program_evidence_answer_service,
        SupportProgramEvidenceAnswerService,
    )
    assert container.openai_client is client
    assert isinstance(container.support_program_conversation_service, SupportProgramConversationService)
    assert isinstance(container.application_preparation_service, ApplicationPreparationService)
    assert container.application_preparation_service.agent._agent.model is model
    assert container.support_program_conversation_service._agent._agent.model is model
    assert container.support_program_conversation_service._agent._agent.model_settings.timeout == 1.25
    assert container.support_program_conversation_service._agent._run_timeout_seconds == 1.75
    ranking_agent = container.support_program_ranking_service._agent
    assert ranking_agent._agent.model_settings.timeout == 45
    assert ranking_agent._agent.model_settings.extra_args == {"timeout": 45, "service_tier": "default"}
    assert ranking_agent._run_timeout_seconds == 50
    evidence_agent = container.support_program_evidence_answer_service._agent
    assert evidence_agent._agent.model_settings.timeout == 1.25
    assert evidence_agent._run_timeout_seconds == 1.75
    combination_agent = container.combination_review_service.agent
    assert combination_agent._agent.model_settings.timeout == 60
    assert combination_agent._agent.model_settings.extra_args == {"timeout": 60}
    assert combination_agent._run_timeout_seconds == 70
    assert captured_client_arguments == {
        "api_key": "private-key",
        "timeout": 1.25,
        "max_retries": 0,
    }
    # 공용 모델과 도우미 전용(가장 싼) 모델을 같은 클라이언트로 만든다.
    assert captured_models[0] == "test-model" and captured_models[-1] == "gpt-5-nano"
    assert set(captured_models) == {"test-model", "gpt-5-nano"}
    assert captured_model_arguments["openai_client"] is client

    response = await container.support_program_ranking_service.rank(
        SupportProgramRankingRequest(
            originalQuery="서울 AI 반도체",
            scoringVersion=SCORING_VERSION,
            resultLimit=1,
            candidates=[
                SupportProgramCandidate(
                    id="BIZINFO:program-1",
                    title="서울 AI 반도체 지원",
                    organization="기관",
                    summary="반도체 지원",
                    categories=["AI"],
                    regions=["서울"],
                    targetDescription="중소기업",
                    applicationPeriod="상시 접수",
                    status="OPEN",
                )
            ],
        )
    )

    assert response.rankings[0].total_score == 100
    model.assert_complete()
    await container.close()
    assert client.closed is True


@pytest.mark.anyio
@pytest.mark.parametrize("ranking_model,reasoning", [(None, "none"), ("gpt-5.6-sol", "low"), ("gpt-5.6-luna", "low")])
@pytest.mark.parametrize("tier", ["default", "priority"])
async def test_ranking_model_and_reasoning_do_not_change_conversation_or_evidence(
    monkeypatch, ranking_model, reasoning, tier,
):
    client = FakeOpenAIClient()
    captured = []

    def fake_responses_model(**arguments):
        model = ScriptedModel([])
        captured.append((arguments, model))
        return model

    monkeypatch.setattr(bootstrap_module, "AsyncOpenAI", lambda **kwargs: client)
    monkeypatch.setattr(bootstrap_module, "OpenAIResponsesModel", fake_responses_model)
    settings = replace(OPENAI_SETTINGS, openai_ranking_model=ranking_model,
                       openai_ranking_reasoning_effort=reasoning,
                       openai_ranking_service_tier=tier)
    container = build_application_container(settings)
    try:
        general_arguments, general_model = captured[0]
        ranking_arguments, selected_ranking_model = captured[1]
        assert general_arguments == {"model": "test-model", "openai_client": client}
        assert ranking_arguments == {"model": ranking_model or "test-model", "openai_client": client}
        ranking = container.support_program_ranking_service._agent._agent
        conversation = container.support_program_conversation_service._agent._agent
        evidence = container.support_program_evidence_answer_service._agent._agent
        assert ranking.model is selected_ranking_model
        assert ranking.model_settings.reasoning.effort == reasoning
        assert ranking.model_settings.timeout == 45
        assert ranking.model_settings.extra_args == {"timeout": 45, "service_tier": tier}
        for agent in (conversation, evidence):
            assert agent.model is general_model
            assert agent.model_settings.reasoning.effort == "none"
            assert agent.model_settings.timeout == 1.25
            assert not agent.model_settings.extra_args or "service_tier" not in agent.model_settings.extra_args
        # 도우미는 랭킹 설정과 무관하게 전용 모델·low 추론을 쓰고 Fast 등급을 붙이지 않는다.
        assistant_arguments, assistant_model = captured[2]
        assert assistant_arguments == {"model": "gpt-5-nano", "openai_client": client}
        assistant = container.assistant_service._agent._agent
        assert assistant.model is assistant_model
        assert assistant.model_settings.reasoning.effort == "low"
        assert assistant.model_settings.timeout == 1.25
        assert "service_tier" not in (assistant.model_settings.extra_args or {})
        assert container.openai_client is client
        assert container.support_program_index_service.openai_client is client
        assert container.support_program_evidence_service.openai_client is client
        assert len(captured) == 3
        general_model.assert_complete()
        selected_ranking_model.assert_complete()
        assistant_model.assert_complete()
    finally:
        await container.close()
    assert client.closed


def test_application_lifespan_closes_container_owned_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeOpenAIClient()
    container = ApplicationContainer(
        support_program_ranking_service=SupportProgramRankingService(NeverCalledAgent()),
        openai_client=client,  # type: ignore[arg-type]
    )

    monkeypatch.setattr(
        main_module,
        "build_application_container",
        lambda *args, **kwargs: container,
    )

    with TestClient(main_module.create_app(settings=OPENAI_SETTINGS)) as test_client:
        assert client.closed is False
        assert test_client.get("/internal/v1/health").status_code == 200

    assert client.closed is True


@pytest.mark.anyio
async def test_closes_both_qdrant_and_openai_clients() -> None:
    from unittest.mock import AsyncMock

    openai = FakeOpenAIClient()
    qdrant = AsyncMock()
    container = ApplicationContainer(
        support_program_ranking_service=SupportProgramRankingService(NeverCalledAgent()),
        openai_client=openai,  # type: ignore[arg-type]
        qdrant_client=qdrant,
    )
    await container.close()
    qdrant.close.assert_awaited_once()
    assert openai.closed is True
