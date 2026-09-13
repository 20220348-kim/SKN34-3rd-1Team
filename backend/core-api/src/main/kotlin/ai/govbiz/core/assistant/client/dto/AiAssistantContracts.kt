package ai.govbiz.core.assistant.client.dto

/** AI Service `POST /internal/v1/assistant/answers` 요청입니다. 필드 이름과 상한은 AI Service `app/assistant/models.py`와 같습니다. */
data class AiAssistantAnswerRequest(
    val schemaVersion: String,
    val message: String,
    val history: List<AiAssistantHistoryMessage>,
    val session: AiAssistantSession,
    val context: AiAssistantContext,
    val helpEntries: List<AiAssistantHelpEntry>,
)

data class AiAssistantHistoryMessage(
    val role: String,
    val content: String,
)

data class AiAssistantSession(
    val authenticated: Boolean,
    val hasCompany: Boolean,
)

data class AiAssistantContext(
    val route: String,
    val programSelected: Boolean,
)

data class AiAssistantHelpEntry(
    val id: String,
    val title: String,
    val question: String,
    val summary: String,
    val body: List<String>,
    val limitation: String?,
    val audience: String,
    val status: String,
    val action: AiAssistantHelpAction?,
)

data class AiAssistantHelpAction(
    val label: String,
    val to: String,
)

/** AI Service 응답입니다. 의도별 필드 조합은 Core Service가 다시 검증합니다. */
data class AiAssistantAnswerPayload(
    val schemaVersion: String?,
    val intent: String?,
    val answer: String?,
    val citations: List<String?>?,
    val clarificationQuestion: String?,
    val searchQuery: String?,
    val accountTopic: String?,
)
