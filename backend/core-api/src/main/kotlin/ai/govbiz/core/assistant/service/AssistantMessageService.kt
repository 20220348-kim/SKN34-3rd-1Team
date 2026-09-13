package ai.govbiz.core.assistant.service

import ai.govbiz.core._common.exception.AiServiceCallException
import ai.govbiz.core.account.domain.Account
import ai.govbiz.core.assistant.client.AiAssistantClient
import ai.govbiz.core.assistant.client.dto.AiAssistantAnswerPayload
import ai.govbiz.core.assistant.client.dto.AiAssistantAnswerRequest
import ai.govbiz.core.assistant.client.dto.AiAssistantContext
import ai.govbiz.core.assistant.client.dto.AiAssistantHelpAction
import ai.govbiz.core.assistant.client.dto.AiAssistantHelpEntry
import ai.govbiz.core.assistant.client.dto.AiAssistantHistoryMessage
import ai.govbiz.core.assistant.client.dto.AiAssistantSession
import ai.govbiz.core.assistant.domain.AssistantAccountTopic
import ai.govbiz.core.assistant.domain.AssistantAnswer
import ai.govbiz.core.assistant.domain.AssistantHelpEntry
import ai.govbiz.core.assistant.domain.AssistantIntent
import ai.govbiz.core.assistant.domain.AssistantNavigation
import ai.govbiz.core.assistant.domain.AssistantQuestion
import ai.govbiz.core.partner.domain.PartnerProposalBox
import ai.govbiz.core.partner.domain.PartnerProposalStatus
import ai.govbiz.core.partner.service.PartnerProposalService
import ai.govbiz.core.supportprogram.domain.SavedSupportProgram
import ai.govbiz.core.supportprogram.service.saved.SavedSupportProgramService
import java.time.Clock
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service

/**
 * 도우미 자유 질문 한 건을 처리합니다. 개인 정보를 가린 질문을 AI Service에 한 번 보내 의도를 받고,
 * 의도에 따라 Core가 회원 자료(관심 공고함·받은 제안함·기업)를 읽어 답을 만들거나 기존 화면으로 안내합니다.
 * 대화 전문은 저장하지 않으며, AI 응답의 인용·이동 경로는 요청에 실린 도움말과 내부 경로 목록 안에서만 인정합니다.
 */
@Service
class AssistantMessageService(
    private val client: AiAssistantClient,
    private val savedSupportProgramService: SavedSupportProgramService,
    private val partnerProposalService: PartnerProposalService,
    @param:Qualifier("seoulClock") private val clock: Clock,
) {
    fun answer(account: Account?, question: AssistantQuestion): AssistantAnswer {
        val payload = client.answer(toRequest(account, question))
        val verified = verify(payload, question)
        return when (verified.intent) {
            AssistantIntent.PRODUCT_HELP -> productHelp(verified, question)
            AssistantIntent.ACCOUNT_STATE -> accountState(verified.accountTopic!!, account)
            AssistantIntent.SEARCH -> search(verified.searchQuery!!)
            AssistantIntent.PROGRAM_QUESTION -> programQuestion(question)
            AssistantIntent.OUT_OF_SCOPE -> AssistantAnswer(verified.intent, verified.answer, emptyList(), null, null, null, null)
            AssistantIntent.UNCLEAR -> AssistantAnswer(verified.intent, null, emptyList(), verified.clarificationQuestion, null, null, null)
        }
    }

    private fun toRequest(account: Account?, question: AssistantQuestion): AiAssistantAnswerRequest =
        AiAssistantAnswerRequest(
            SCHEMA_VERSION,
            AssistantPiiMasker.mask(question.message).take(MESSAGE_MAX),
            question.history.map { AiAssistantHistoryMessage(it.role.name, AssistantPiiMasker.mask(it.content).take(HISTORY_MAX)) },
            AiAssistantSession(account != null, account?.company != null),
            AiAssistantContext(question.context.route, question.context.programSelected),
            question.helpEntries.map {
                AiAssistantHelpEntry(
                    it.id, it.title, it.question, it.summary, it.body, it.limitation, it.audience, it.status,
                    it.action?.let { action -> AiAssistantHelpAction(action.label, action.to) },
                )
            },
        )

    /** AI Service와 같은 의도별 필드 규칙을 Core에서 다시 확인합니다. 어긋나면 답을 고치지 않고 502로 끝냅니다. */
    private fun verify(payload: AiAssistantAnswerPayload, question: AssistantQuestion): VerifiedPayload {
        if (payload.schemaVersion != SCHEMA_VERSION) invalidResponse()
        val intent = AssistantIntent.entries.firstOrNull { it.name == payload.intent } ?: invalidResponse()
        val citations = payload.citations ?: invalidResponse()
        if (citations.size > MAX_CITATIONS || citations.any { it == null } || citations.toSet().size != citations.size) invalidResponse()
        val helpIds = question.helpEntries.map { it.id }.toSet()
        val citedIds = citations.map { it!! }
        if (citedIds.any { it !in helpIds }) invalidResponse()
        val answer = payload.answer?.also { if (!validText(it, ANSWER_MAX, multiline = true)) invalidResponse() }
        val clarification = payload.clarificationQuestion?.also { if (!validText(it, SHORT_MAX)) invalidResponse() }
        val searchQuery = payload.searchQuery?.also { if (!validText(it, MESSAGE_MAX, multiline = true)) invalidResponse() }
        val accountTopic = payload.accountTopic?.let { name ->
            AssistantAccountTopic.entries.firstOrNull { it.name == name } ?: invalidResponse()
        }
        val present = buildSet {
            if (answer != null) add("answer")
            if (citedIds.isNotEmpty()) add("citations")
            if (clarification != null) add("clarificationQuestion")
            if (searchQuery != null) add("searchQuery")
            if (accountTopic != null) add("accountTopic")
        }
        val expected = when (intent) {
            AssistantIntent.PRODUCT_HELP -> setOf("answer", "citations")
            AssistantIntent.ACCOUNT_STATE -> setOf("accountTopic")
            AssistantIntent.SEARCH -> setOf("searchQuery")
            AssistantIntent.PROGRAM_QUESTION -> emptySet()
            AssistantIntent.OUT_OF_SCOPE -> setOf("answer")
            AssistantIntent.UNCLEAR -> setOf("clarificationQuestion")
        }
        if (present != expected) invalidResponse()
        return VerifiedPayload(intent, answer, citedIds, clarification, searchQuery, accountTopic)
    }

    /** 사용법 답입니다. 첫 인용 항목의 행동 버튼을 그대로 붙입니다. 경로는 프런트 도움말이 정한 값이라 요청에 실린 것만 씁니다. */
    private fun productHelp(payload: VerifiedPayload, question: AssistantQuestion): AssistantAnswer {
        val navigation = payload.citations.asSequence()
            .mapNotNull { id -> question.helpEntries.firstOrNull { it.id == id }?.action }
            .firstOrNull()
        return AssistantAnswer(AssistantIntent.PRODUCT_HELP, payload.answer, payload.citations, null, null, null, navigation)
    }

    private fun search(query: String): AssistantAnswer =
        AssistantAnswer(
            AssistantIntent.SEARCH,
            AssistantAnswerTexts.search(query),
            emptyList(), null, query, null,
            AssistantNavigation(AssistantAnswerTexts.OPEN_SEARCH_FOR_QUERY, InternalRoutes.CHAT),
        )

    /** 원문 질문은 공고 문서를 근거로 답하는 기존 화면이 맡습니다. 공고 상세에 있으면 프런트가 그 공고의 질문 화면 버튼을 붙입니다. */
    private fun programQuestion(question: AssistantQuestion): AssistantAnswer =
        if (question.context.programSelected) {
            AssistantAnswer(AssistantIntent.PROGRAM_QUESTION, AssistantAnswerTexts.PROGRAM_QUESTION_ON_DETAIL, emptyList(), null, null, null, null)
        } else {
            AssistantAnswer(
                AssistantIntent.PROGRAM_QUESTION, AssistantAnswerTexts.PROGRAM_QUESTION_NO_PROGRAM, emptyList(), null, null, null,
                AssistantNavigation(AssistantAnswerTexts.OPEN_SEARCH, InternalRoutes.CHAT),
            )
        }

    private fun accountState(topic: AssistantAccountTopic, account: Account?): AssistantAnswer {
        val (answer, navigation) = when {
            account == null -> AssistantAnswerTexts.loginRequired(topic) to null
            topic == AssistantAccountTopic.SAVED_PROGRAMS -> savedPrograms(account)
            topic == AssistantAccountTopic.RECEIVED_PROPOSALS -> receivedProposals(account)
            else -> companyProfile(account)
        }
        return AssistantAnswer(AssistantIntent.ACCOUNT_STATE, answer, emptyList(), null, null, topic, navigation)
    }

    private fun savedPrograms(account: Account): Pair<String, AssistantNavigation?> {
        val saved = savedSupportProgramService.list(account.id)
        if (saved.isEmpty()) {
            return AssistantAnswerTexts.SAVED_NONE to AssistantNavigation(AssistantAnswerTexts.OPEN_SEARCH, InternalRoutes.CHAT)
        }
        val today = LocalDate.now(clock)
        val upcoming = saved.filter { it.endDate == null || !it.endDate!!.isBefore(today) }
        val nearest = upcoming.filter { it.endDate != null }.minByOrNull { it.endDate!! }
        val soon = upcoming.count { it.endDate != null && ChronoUnit.DAYS.between(today, it.endDate) <= SOON_DAYS }
        val answer = when {
            upcoming.isEmpty() -> AssistantAnswerTexts.savedAllClosed(saved.size)
            nearest == null -> AssistantAnswerTexts.savedSummary(saved.size, soon, null)
            else -> AssistantAnswerTexts.savedSummary(
                saved.size, soon,
                AssistantAnswerTexts.Deadline(nearest.program.title, nearest.endDate!!, ChronoUnit.DAYS.between(today, nearest.endDate).toInt()),
            )
        }
        return answer to AssistantNavigation(AssistantAnswerTexts.OPEN_SAVED, InternalRoutes.SAVED_PROGRAMS)
    }

    private fun receivedProposals(account: Account): Pair<String, AssistantNavigation?> {
        if (account.company == null) {
            return AssistantAnswerTexts.PROPOSALS_NEED_COMPANY to AssistantNavigation(AssistantAnswerTexts.OPEN_PROFILE, InternalRoutes.PROFILE)
        }
        val pending = partnerProposalService.findBox(account, PartnerProposalBox.RECEIVED)
            .filter { it.status == PartnerProposalStatus.PENDING }
        val earliest = pending.minOfOrNull { it.proposal.expiresAt }?.toLocalDate()
        val answer = if (pending.isEmpty()) AssistantAnswerTexts.PROPOSALS_NONE else AssistantAnswerTexts.proposalsSummary(pending.size, earliest)
        return answer to AssistantNavigation(AssistantAnswerTexts.OPEN_PROPOSALS, InternalRoutes.PROPOSALS)
    }

    private fun companyProfile(account: Account): Pair<String, AssistantNavigation?> {
        val company = account.company
        val answer = if (company == null) AssistantAnswerTexts.COMPANY_NONE else AssistantAnswerTexts.companyRegistered(company.companyName)
        return answer to AssistantNavigation(AssistantAnswerTexts.OPEN_PROFILE, InternalRoutes.PROFILE)
    }

    private val SavedSupportProgram.endDate: LocalDate?
        get() = program.applicationEndDate

    private fun validText(value: String, maximum: Int, multiline: Boolean = false): Boolean =
        value.isNotBlank() && value.length <= maximum && !(if (multiline) UNSUPPORTED_LAYOUT_TEXT else UNSUPPORTED_TEXT).containsMatchIn(value)

    private fun invalidResponse(): Nothing =
        throw AiServiceCallException.invalidResponse("AI assistant response violated the internal contract", null)

    private data class VerifiedPayload(
        val intent: AssistantIntent,
        val answer: String?,
        val citations: List<String>,
        val clarificationQuestion: String?,
        val searchQuery: String?,
        val accountTopic: AssistantAccountTopic?,
    )

    /** 답변 버튼이 열 수 있는 내부 화면입니다. 프런트 `appPaths`의 값과 같아야 합니다. */
    object InternalRoutes {
        const val CHAT = "/app/chat"
        const val SAVED_PROGRAMS = "/app/saved-programs"
        const val PROPOSALS = "/app/proposals"
        const val PROFILE = "/app/profile"
    }

    companion object {
        const val SCHEMA_VERSION = "govbiz-assistant-v1"
        const val MESSAGE_MAX = 500
        const val HISTORY_MAX = 1000
        const val ANSWER_MAX = 600
        const val SHORT_MAX = 160
        const val MAX_CITATIONS = 3
        const val SOON_DAYS = 7L
        private val UNSUPPORTED_TEXT = Regex("\\p{C}")
        private val UNSUPPORTED_LAYOUT_TEXT = Regex("[\\p{C}&&[^\\n\\r\\t]]")
    }
}
