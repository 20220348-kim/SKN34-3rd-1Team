import asyncio
import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith import tracing_context
from openai import APITimeoutError

from app.application_preparation.discovery_prompt import DISCOVERY_INSTRUCTIONS
from app.application_preparation.models import (
    DiscoverFormsRequest,
    FormDiscoverySelection,
    InterpretationSelection,
    InterpretRequest,
)
from app.application_preparation.prompt import INSTRUCTIONS
from app.application_preparation.draft_prompt import DRAFT_INSTRUCTIONS
from app.application_preparation.models import DraftRequest, DraftSelection
from app.application_preparation.document import DOCUMENT_INSTRUCTIONS, DocumentRequest, DocumentSelection


class ApplicationFormDiscoveryTimeoutError(TimeoutError):
    def __init__(self, stage: str):
        super().__init__("Application form discovery timed out")
        self.stage = stage


class ApplicationPreparationAgent:
    """Structured application calls with no tools or handoffs."""

    def __init__(self, *, model: ChatOpenAI, run_timeout_seconds: float, discovery_model_timeout_seconds: float = 210.0, discovery_run_timeout_seconds: float = 240.0):
        self._run_timeout_seconds = run_timeout_seconds
        self._model = model
        self.discovery_model_timeout_seconds = discovery_model_timeout_seconds
        self.discovery_run_timeout_seconds = discovery_run_timeout_seconds
        if not 0 < discovery_model_timeout_seconds < discovery_run_timeout_seconds:
            raise ValueError("Discovery model timeout must be less than run timeout")

    async def _invoke(self, selection_type, instructions, content, max_tokens, timeout_message, *, discovery=False):
        updates = {"max_tokens": max_tokens}
        structured = self._model.model_copy(update=updates).with_structured_output(
            selection_type, method="json_schema", strict=True, include_raw=True,
            **({"timeout": self.discovery_model_timeout_seconds} if discovery else {}),
        )
        try:
            async with asyncio.timeout(self.discovery_run_timeout_seconds if discovery else self._run_timeout_seconds):
                with tracing_context(enabled=False):
                    result = await structured.ainvoke(
                        [SystemMessage(content=instructions), HumanMessage(content=content)],
                    )
        except APITimeoutError as error:
            if discovery:
                raise ApplicationFormDiscoveryTimeoutError("AI_MODEL") from error
            raise TimeoutError(timeout_message) from error
        except TimeoutError as error:
            if discovery:
                raise ApplicationFormDiscoveryTimeoutError("AI_RUN") from error
            raise TimeoutError(timeout_message) from error
        if (result["parsing_error"] is not None
                or result["raw"].response_metadata.get("status") != "completed"
                or not isinstance(result["parsed"], selection_type)):
            raise ValueError("invalid application preparation output")
        return selection_type.model_validate(result["parsed"].model_dump())

    async def place_document(
        self,
        request: DocumentRequest,
        excluded_target_ids: set[str] | None = None,
        rejected_output: DocumentSelection | None = None,
    ) -> DocumentSelection:
        prompt: dict = request.model_dump(exclude={"pageImages"})
        content = [{"type": "text", "text": json.dumps(prompt, ensure_ascii=False)}]
        if not request.facts:
            classification = {
                "classificationOnly": {
                    "validExampleTargetIds": [target.id for target in request.targets if target.exampleText.strip()],
                    "instruction": (
                        "Return no placements and no unmapped facts. Partition every validExampleTargetId exactly "
                        "once between clearExampleTargetIds and preserveExampleTargetIds. Never add another ID."
                    ),
                },
            }
            content.append({"type": "text", "text": json.dumps(classification, ensure_ascii=False)})
        if excluded_target_ids is not None:
            repair = {
                "repair": {
                    "rejectedSelection": rejected_output.model_dump() if rejected_output is not None else None,
                    "excludedPlacementTargetIds": sorted(excluded_target_ids),
                    "validExampleTargetIds": [target.id for target in request.targets if target.exampleText.strip()],
                    "instruction": (
                        "Return a complete selection for the supplied repair facts. Never place an answer in an "
                        "excludedPlacementTargetId. Use a distinct remaining target for each fact or mark it "
                        "unmapped. Independently partition every validExampleTargetId exactly once between the "
                        "clear and preserve lists, and never add another example ID."
                    ),
                },
            }
            content.append({"type": "text", "text": json.dumps(repair, ensure_ascii=False)})
        content.extend({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{page}", "detail": "high"}} for page in request.pageImages)
        return await self._invoke(
            DocumentSelection, DOCUMENT_INSTRUCTIONS, content, 10000, "Document placement timed out",
        )

    async def draft(self, request: DraftRequest) -> DraftSelection:
        return await self._invoke(
            DraftSelection, DRAFT_INSTRUCTIONS, json.dumps(request.model_dump(), ensure_ascii=False),
            5000, "Application draft agent timed out",
        )

    async def interpret(self, request: InterpretRequest) -> InterpretationSelection:
        return await self._invoke(
            InterpretationSelection, INSTRUCTIONS, json.dumps(request.model_dump(), ensure_ascii=False),
            2500, "Application preparation agent timed out",
        )

    async def discover(self, request: DiscoverFormsRequest) -> FormDiscoverySelection:
        return await self._invoke(
            FormDiscoverySelection, DISCOVERY_INSTRUCTIONS, json.dumps(request.model_dump(), ensure_ascii=False),
            5000, "Application form discovery agent timed out", discovery=True,
        )
