package ai.govbiz.core.assistant.controller.dto

import ai.govbiz.core.assistant.domain.AssistantAnswer

/** 도우미 답 한 건입니다. 프런트는 `intent`로 말풍선 모양을 정하고 `navigation`으로 버튼 하나를 붙입니다. */
data class AssistantMessageResponse(
    val intent: String,
    val answer: String?,
    val citations: List<String>,
    val clarificationQuestion: String?,
    val searchQuery: String?,
    val accountTopic: String?,
    val navigation: AssistantNavigationResponse?,
) {
    companion object {
        fun from(answer: AssistantAnswer) = AssistantMessageResponse(
            answer.intent.name,
            answer.answer,
            answer.citations,
            answer.clarificationQuestion,
            answer.searchQuery,
            answer.accountTopic?.name,
            answer.navigation?.let { AssistantNavigationResponse(it.label, it.to) },
        )
    }
}

data class AssistantNavigationResponse(
    val label: String,
    val to: String,
)
