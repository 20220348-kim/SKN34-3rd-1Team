import asyncio
import json

from agents import Agent, Model, ModelSettings, ModelTimeoutError, RunConfig, Runner
from openai import APITimeoutError
from openai.types.shared import Reasoning

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


class ApplicationPreparationAgent:
    """Structured application calls with no tools or handoffs."""

    def __init__(self, *, model: Model, model_timeout_seconds: float, run_timeout_seconds: float):
        self._run_timeout_seconds = run_timeout_seconds
        self._agent = Agent(
            name="GovBiz Application Preparation",
            model=model,
            instructions=INSTRUCTIONS,
            output_type=InterpretationSelection,
            model_settings=ModelSettings(
                max_tokens=2500,
                reasoning=Reasoning(effort="none"),
                store=False,
                timeout=model_timeout_seconds,
                extra_args={"timeout": model_timeout_seconds},
            ),
        )
        self._discovery_agent = Agent(
            name="GovBiz Application Form Discovery",
            model=model,
            instructions=DISCOVERY_INSTRUCTIONS,
            output_type=FormDiscoverySelection,
            model_settings=ModelSettings(
                max_tokens=5000,
                reasoning=Reasoning(effort="none"),
                store=False,
                timeout=model_timeout_seconds,
                extra_args={"timeout": model_timeout_seconds},
            ),
        )
        self._run_config = RunConfig(tracing_disabled=True, trace_include_sensitive_data=False)
        self._document_agent = Agent(
            name="GovBiz Original Document Placement", model=model,
            instructions=DOCUMENT_INSTRUCTIONS, output_type=DocumentSelection,
            model_settings=ModelSettings(max_tokens=10000, reasoning=Reasoning(effort="none"), store=False,
                                        timeout=model_timeout_seconds, extra_args={"timeout": model_timeout_seconds}),
        )
        self._draft_agent = Agent(
            name="GovBiz Application Draft",
            model=model,
            instructions=DRAFT_INSTRUCTIONS,
            output_type=DraftSelection,
            model_settings=ModelSettings(
                max_tokens=5000, reasoning=Reasoning(effort="none"), store=False,
                timeout=model_timeout_seconds, extra_args={"timeout": model_timeout_seconds},
            ),
        )

    async def place_document(
        self,
        request: DocumentRequest,
        excluded_target_ids: set[str] | None = None,
        rejected_output: DocumentSelection | None = None,
    ) -> DocumentSelection:
        prompt: dict = request.model_dump(exclude={"pageImages"})
        content = [{"type": "input_text", "text": json.dumps(prompt, ensure_ascii=False)}]
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
            content.append({"type": "input_text", "text": json.dumps(classification, ensure_ascii=False)})
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
            content.append({"type": "input_text", "text": json.dumps(repair, ensure_ascii=False)})
        content.extend({"type": "input_image", "image_url": f"data:image/png;base64,{page}", "detail": "high"} for page in request.pageImages)
        try:
            async with asyncio.timeout(self._run_timeout_seconds):
                result = await Runner.run(self._document_agent, [{"role": "user", "content": content}], max_turns=1, run_config=self._run_config)
        except (ModelTimeoutError, APITimeoutError, TimeoutError) as error:
            raise TimeoutError("Document placement timed out") from error
        if not isinstance(result.final_output, DocumentSelection):
            raise ValueError("invalid document placement")
        return DocumentSelection.model_validate(result.final_output.model_dump())

    async def draft(self, request: DraftRequest) -> DraftSelection:
        try:
            async with asyncio.timeout(self._run_timeout_seconds):
                result = await Runner.run(
                    self._draft_agent, json.dumps(request.model_dump(), ensure_ascii=False),
                    max_turns=1, run_config=self._run_config,
                )
        except (ModelTimeoutError, APITimeoutError, TimeoutError) as error:
            raise TimeoutError("Application draft agent timed out") from error
        if not isinstance(result.final_output, DraftSelection):
            raise ValueError("invalid application draft output")
        return DraftSelection.model_validate(result.final_output.model_dump())

    async def interpret(self, request: InterpretRequest) -> InterpretationSelection:
        try:
            async with asyncio.timeout(self._run_timeout_seconds):
                result = await Runner.run(
                    self._agent,
                    json.dumps(request.model_dump(), ensure_ascii=False),
                    max_turns=1,
                    run_config=self._run_config,
                )
        except (ModelTimeoutError, APITimeoutError, TimeoutError) as error:
            raise TimeoutError("Application preparation agent timed out") from error
        if not isinstance(result.final_output, InterpretationSelection):
            raise ValueError("invalid application preparation output")
        return InterpretationSelection.model_validate(result.final_output.model_dump())

    async def discover(self, request: DiscoverFormsRequest) -> FormDiscoverySelection:
        try:
            async with asyncio.timeout(self._run_timeout_seconds):
                result = await Runner.run(
                    self._discovery_agent,
                    json.dumps(request.model_dump(), ensure_ascii=False),
                    max_turns=1,
                    run_config=self._run_config,
                )
        except (ModelTimeoutError, APITimeoutError, TimeoutError) as error:
            raise TimeoutError("Application form discovery agent timed out") from error
        if not isinstance(result.final_output, FormDiscoverySelection):
            raise ValueError("invalid application form discovery output")
        return FormDiscoverySelection.model_validate(result.final_output.model_dump())
