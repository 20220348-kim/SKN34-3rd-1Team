import logging
from time import perf_counter

from app.application_preparation.agent import ApplicationPreparationAgent
from app.application_preparation.discovery_prompt import DISCOVERY_PROMPT_VERSION
from app.application_preparation.models import (
    CONTRACT_VERSION,
    DISCOVERY_CONTRACT_VERSION,
    DiscoverFormsRequest,
    FormDiscoverySelection,
    InterpretationSelection,
    InterpretRequest,
    validate_discovery,
    validate_selection,
)
from app.application_preparation.prompt import PROMPT_VERSION
from app.application_preparation.draft_prompt import DRAFT_PROMPT_VERSION
from app.application_preparation.models import DraftRequest, validate_draft
from app.application_preparation.document import DocumentRequest, DocumentValidationError, validate_document

logger = logging.getLogger(__name__)


class ApplicationPreparationError(RuntimeError):
    pass


class ApplicationPreparationService:
    def __init__(self, agent: ApplicationPreparationAgent, model_name: str):
        self.agent = agent
        self.model_name = model_name

    def configuration(self) -> dict:
        return {"contractVersion": CONTRACT_VERSION, "model": self.model_name, "promptVersion": PROMPT_VERSION}

    async def place_document(self, request: DocumentRequest) -> dict:
        started = perf_counter()
        stage = "model"
        try:
            output = await self.agent.place_document(request)
            stage = "validation"
            validate_document(request, output)
            return {"contractVersion": "application-document-v1", **output.model_dump()}
        except TimeoutError as error:
            logger.warning("application_document_failed stage=%s error_type=%s elapsed_ms=%d", stage, type(error).__name__, round((perf_counter() - started) * 1000))
            raise ApplicationPreparationError("APPLICATION_PREPARATION_TIMEOUT") from error
        except Exception as error:
            logger.warning(
                "application_document_failed stage=%s error_type=%s reason=%s fact_count=%d target_count=%d elapsed_ms=%d",
                stage, type(error).__name__, error.reason if isinstance(error, DocumentValidationError) else "NONE",
                len(request.facts), len(request.targets), round((perf_counter() - started) * 1000),
            )
            raise ApplicationPreparationError("APPLICATION_PREPARATION_FAILED") from error

    def draft_configuration(self) -> dict:
        return {"contractVersion": "application-preparation-draft-v1", "model": self.model_name, "promptVersion": DRAFT_PROMPT_VERSION}

    async def draft(self, request: DraftRequest) -> dict:
        try:
            output = await self.agent.draft(request)
            validate_draft(request, output)
            labels = {field.fieldKey: field.label for field in request.fieldOptions}
            unknown = [f"{labels[fact.fieldKey]}: 미정" for fact in request.currentFacts if fact.status == "UNKNOWN"]
            content = "\n\n".join([output.content.strip(), *unknown])
            return {
                **self.draft_configuration(), "preparationId": request.preparationId,
                "inputRevision": request.inputRevision, "formVersionId": request.formVersionId,
                "sectionKey": request.sectionKey, "content": content, "usedFieldKeys": output.usedFieldKeys,
            }
        except TimeoutError as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_TIMEOUT") from error
        except Exception as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_FAILED") from error

    def discovery_configuration(self) -> dict:
        return {
            "contractVersion": DISCOVERY_CONTRACT_VERSION,
            "model": self.model_name,
            "promptVersion": DISCOVERY_PROMPT_VERSION,
        }

    async def interpret(self, request: InterpretRequest) -> dict:
        try:
            output: InterpretationSelection = await self.agent.interpret(request)
            validate_selection(request, output)
            return {
                **self.configuration(),
                "preparationId": request.preparationId,
                "inputRevision": request.inputRevision,
                "formVersionId": request.formVersionId,
                "sectionKey": request.sectionKey,
                **output.model_dump(),
            }
        except TimeoutError as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_TIMEOUT") from error
        except Exception as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_FAILED") from error

    async def discover(self, request: DiscoverFormsRequest) -> dict:
        try:
            output: FormDiscoverySelection = await self.agent.discover(request)
            validate_discovery(request, output)
            return {**self.discovery_configuration(), **output.model_dump()}
        except TimeoutError as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_TIMEOUT") from error
        except Exception as error:
            raise ApplicationPreparationError("APPLICATION_PREPARATION_FAILED") from error
