package ai.govbiz.core.assistant.client

import ai.govbiz.core._common.exception.AiServiceCallException
import ai.govbiz.core._common.helper.executeAiServiceCall
import ai.govbiz.core.assistant.client.dto.AiAssistantAnswerPayload
import ai.govbiz.core.assistant.client.dto.AiAssistantAnswerRequest
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

/** 도우미 자유 질문의 의도 분류·답변을 AI Service에 한 번 요청합니다. 검색·조회·저장은 하지 않습니다. */
@Component
class AiAssistantClient(
    @param:Qualifier("aiServiceRestClient") private val restClient: RestClient,
) {
    fun answer(request: AiAssistantAnswerRequest): AiAssistantAnswerPayload =
        executeAiServiceCall {
            restClient.post()
                .uri("/internal/v1/assistant/answers")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .onStatus(
                    { it.value() != HttpStatus.OK.value() },
                    { _, response ->
                        when (val status = response.statusCode.value()) {
                            HttpStatus.NO_CONTENT.value() ->
                                throw AiServiceCallException.invalidResponse("AI assistant response was empty", null)
                            HttpStatus.SERVICE_UNAVAILABLE.value() -> throw AiServiceCallException.unavailable(null)
                            HttpStatus.REQUEST_TIMEOUT.value(), HttpStatus.GATEWAY_TIMEOUT.value() ->
                                throw AiServiceCallException.timeout(null)
                            else -> throw AiServiceCallException.upstreamError("AI assistant returned HTTP $status", null)
                        }
                    },
                )
                .toEntity(AiAssistantAnswerPayload::class.java)
                .body
                ?: throw AiServiceCallException.invalidResponse("AI assistant response was empty", null)
        }
}
