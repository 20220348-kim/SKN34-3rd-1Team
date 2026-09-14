import asyncio
import json

import pytest
from openai import InternalServerError

from app.application_preparation.agent import ApplicationPreparationAgent
from app.application_preparation.models import DraftRequest, DiscoverFormsRequest, InterpretRequest
from app.application_preparation.document import DocumentRequest
from .model_fixture import make_model
from .test_interpretation import request_data, selection_data, discovery_request_data, discovery_selection_data
from .test_draft import request_data as draft_request
from .test_document import request_data as document_request, selection_data as document_selection


CASES = [
    ("interpret", InterpretRequest, request_data, selection_data, 2500),
    ("discover", DiscoverFormsRequest, discovery_request_data, discovery_selection_data, 5000),
    ("draft", DraftRequest, draft_request,
     lambda: {"content": "새봄테크", "usedFieldKeys": ["company-name"]}, 5000),
    ("place_document", DocumentRequest, document_request, document_selection, 10000),
]


@pytest.mark.parametrize("method,request_type,request_factory,selection_factory,tokens", CASES)
def test_responses_contract_and_limits(method, request_type, request_factory, selection_factory, tokens):
    model = make_model(selection_factory())
    agent = ApplicationPreparationAgent(model=model, run_timeout_seconds=3)
    asyncio.run(getattr(agent, method)(request_type.model_validate(request_factory())))
    assert len(model.calls) == 1
    call = model.calls[0]
    body = json.loads(call.content)
    assert call.url.path == "/v1/responses"
    assert call.extensions["timeout"]["read"] == 2
    assert body["max_output_tokens"] == tokens
    assert body["store"] is False
    assert body["reasoning"] == {"effort": "none"}
    assert not body.get("tools")
    assert body["text"]["format"]["strict"] is True


@pytest.mark.parametrize("method,request_type,request_factory,selection_factory,tokens", CASES)
@pytest.mark.parametrize("failure", ["incomplete", "invalid", "refusal", "http", "transport_timeout", "deadline"])
def test_model_failure_is_not_a_success(method, request_type, request_factory, selection_factory, tokens, failure):
    options = {
        "incomplete": {"status": "incomplete"},
        "invalid": {"content": [{"type": "output_text", "text": "{", "annotations": []}]},
        "refusal": {"content": [{"type": "refusal", "refusal": "cannot comply"}]},
        "http": {"http_status": 500},
        "transport_timeout": {"transport_timeout": True},
        "deadline": {"delay": 1},
    }[failure]
    model = make_model(selection_factory(), **options)
    agent = ApplicationPreparationAgent(model=model, run_timeout_seconds=0.3 if failure == "deadline" else 3)
    expected_error = (TimeoutError if failure in ("transport_timeout", "deadline")
                      else InternalServerError if failure == "http" else ValueError)
    with pytest.raises(expected_error):
        asyncio.run(getattr(agent, method)(request_type.model_validate(request_factory())))
    assert len(model.calls) == 1


def test_document_images_and_repair_are_preserved():
    data = document_request()
    data["pageImages"] = ["iVBORw0KGgo="]
    data["targets"][0]["id"] = "page-0"
    request = DocumentRequest.model_validate(data)
    model = make_model(document_selection())
    agent = ApplicationPreparationAgent(model=model, run_timeout_seconds=3)
    asyncio.run(agent.place_document(request, excluded_target_ids={"excluded"}))
    body = json.loads(model.calls[0].content)
    content = next(item["content"] for item in body["input"] if item["role"] == "user")
    image = next(item for item in content if item["type"] == "input_image")
    assert image["image_url"] == "data:image/png;base64,iVBORw0KGgo="
    assert image["detail"] == "high"
    texts = [json.loads(item["text"]) for item in content if item["type"] == "input_text"]
    assert "pageImages" not in texts[0]
    assert texts[1]["repair"]["excludedPlacementTargetIds"] == ["excluded"]
