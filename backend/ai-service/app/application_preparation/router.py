import logging
from time import perf_counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.application_preparation.models import DiscoverFormsRequest, FormDiscoveryValidationError, InterpretRequest
from app.application_preparation.service import ApplicationPreparationError, ApplicationPreparationService

router = APIRouter(prefix="/internal/v1/application-preparations", tags=["internal"])
logger = logging.getLogger(__name__)


def get_service(request: Request) -> ApplicationPreparationService:
    return request.app.state.container.application_preparation_service


@router.get("/configuration")
async def configuration(service: Annotated[ApplicationPreparationService, Depends(get_service)]):
    return service.configuration()


@router.get("/discovery/configuration")
async def discovery_configuration(service: Annotated[ApplicationPreparationService, Depends(get_service)]):
    return service.discovery_configuration()


@router.post("/discovery")
async def discover(payload: DiscoverFormsRequest, service: Annotated[ApplicationPreparationService, Depends(get_service)]):
    try:
        return await service.discover(payload)
    except ApplicationPreparationError as error:
        timed_out = str(error) == "APPLICATION_PREPARATION_TIMEOUT"
        cause = error.__cause__
        validation_failed = isinstance(cause, FormDiscoveryValidationError)
        logger.warning(
            "application_form_discovery_failed failure_kind=%s error_type=%s validation_reason=%s validation_path=%s "
            "code_point_count=%s item_count=%s forbidden_character_count=%s document_count=%d block_count=%d",
            "timeout" if timed_out else "execution",
            type(cause or error).__name__,
            cause.reason if isinstance(cause, FormDiscoveryValidationError) else "NONE",
            cause.path if isinstance(cause, FormDiscoveryValidationError) else "NONE",
            cause.code_point_count if isinstance(cause, FormDiscoveryValidationError) else None,
            cause.item_count if isinstance(cause, FormDiscoveryValidationError) else None,
            cause.forbidden_character_count if isinstance(cause, FormDiscoveryValidationError) else None,
            len(payload.documents),
            sum(len(document.blocks) for document in payload.documents),
        )
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_CONTENT if validation_failed
                         else status.HTTP_504_GATEWAY_TIMEOUT if timed_out else status.HTTP_503_SERVICE_UNAVAILABLE),
            detail={"code": "APPLICATION_FORM_AI_INVALID_RESPONSE" if validation_failed else str(error)},
        ) from error


@router.post("/interpret")
async def interpret(payload: InterpretRequest, service: Annotated[ApplicationPreparationService, Depends(get_service)]):
    started = perf_counter()
    try:
        return await service.interpret(payload)
    except ApplicationPreparationError as error:
        timed_out = str(error) == "APPLICATION_PREPARATION_TIMEOUT"
        logger.warning(
            "application_preparation_failed failure_kind=%s error_type=%s section_key=%s elapsed_ms=%d",
            "timeout" if timed_out else "execution",
            type(error.__cause__ or error).__name__,
            payload.sectionKey,
            round((perf_counter() - started) * 1_000),
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT if timed_out else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": str(error)},
        ) from error
