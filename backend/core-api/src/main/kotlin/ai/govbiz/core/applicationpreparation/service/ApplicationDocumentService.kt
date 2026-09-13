package ai.govbiz.core.applicationpreparation.service

import ai.govbiz.core.account.domain.Account
import ai.govbiz.core.applicationpreparation.client.ai.AiApplicationPreparationClient
import ai.govbiz.core.applicationpreparation.client.ai.dto.AiApplicationDocumentRequest
import ai.govbiz.core.applicationpreparation.client.ai.dto.AiApplicationDocumentPayload
import ai.govbiz.core.applicationpreparation.domain.ApplicationDocumentPlacement
import ai.govbiz.core.applicationpreparation.domain.ApplicationDocumentFact
import ai.govbiz.core.applicationpreparation.domain.ApplicationDocumentFile
import ai.govbiz.core.applicationpreparation.domain.exception.ApplicationPreparationNotFoundException
import ai.govbiz.core.applicationpreparation.domain.exception.ApplicationPreparationRevisionConflictException
import ai.govbiz.core.applicationpreparation.domain.exception.ApplicationPreparationRunConflictException
import ai.govbiz.core.applicationpreparation.repository.ApplicationDocumentRepository
import ai.govbiz.core.applicationpreparation.service.exception.ApplicationDocumentException
import ai.govbiz.core.supportprogram.client.bizinfo.BizInfoAttachmentClient
import ai.govbiz.core.supportprogram.client.cntradenotice.CnTradeNoticeAttachmentClient
import ai.govbiz.core.supportprogram.client.kstartup.KStartupAttachmentClient
import ai.govbiz.core.supportprogram.client.msit.MsitAttachmentClient
import ai.govbiz.core.supportprogram.service.detail.SupportProgramDetailService
import ai.govbiz.core.supportprogram.service.admission.SupportProgramRequestAdmissionService
import org.springframework.stereotype.Service
import java.security.MessageDigest

@Service
class ApplicationDocumentService(
    private val preparations: ApplicationPreparationService,
    private val files: ApplicationDocumentRepository,
    private val editor: ApplicationDocumentEditor,
    private val ai: AiApplicationPreparationClient,
    private val bizInfo: BizInfoAttachmentClient,
    private val msit: MsitAttachmentClient,
    private val kStartup: KStartupAttachmentClient,
    private val cnTrade: CnTradeNoticeAttachmentClient,
    private val details: SupportProgramDetailService,
    private val admission: SupportProgramRequestAdmissionService,
) {
    private val running = java.util.concurrent.ConcurrentHashMap.newKeySet<Long>()
    fun current(account: Account, id: Long): List<ApplicationDocumentFile> {
        val detail = preparations.findOwned(account, id)
        return listOfNotNull(files.findRevision(account.id, id, detail.preparation.inputRevision))
    }

    fun download(account: Account, id: Long, fileId: Long): ApplicationDocumentFile =
        files.findOwned(account.id, id, fileId) ?: throw ApplicationPreparationNotFoundException()

    fun generate(account: Account, id: Long, expectedRevision: Long): List<ApplicationDocumentFile> = admission.execute("application-document:${account.id}:$id") {
        val detail = preparations.findOwned(account, id)
        if (detail.preparation.inputRevision != expectedRevision) throw ApplicationPreparationRevisionConflictException()
        files.findRevision(account.id, id, expectedRevision)?.let { return@execute listOf(it) }
        if (!running.add(id)) throw ApplicationPreparationRunConflictException()
        try {
        val manifest = detail.form
        val facts = manifest.sections.flatMap { section -> section.fields.mapNotNull { field ->
            val fact = detail.facts.find { it.sectionKey == section.key && it.fieldKey == field.key }
            if (fact == null) {
                if (field.required) throw ApplicationDocumentException("APPLICATION_DOCUMENT_INPUT_REQUIRED", "필수 답변을 저장한 뒤 문서를 생성해 주세요.")
                null
            } else if (fact.status.name == "UNKNOWN") null
            else ApplicationDocumentFact("${section.key}:${field.key}", "${section.title} / ${field.label}", requireNotNull(fact.value))
        } }
        if (facts.isEmpty() || facts.size > 200) throw ApplicationDocumentException("APPLICATION_DOCUMENT_INPUT_REQUIRED", "문서에 기입할 답변을 확인해 주세요.")
        val collected = when (manifest.sourceCode) {
            "BIZINFO" -> bizInfo.collect(manifest.sourceCode, manifest.sourceProgramId)
            "MSIT" -> msit.collect(manifest.sourceCode, manifest.sourceProgramId, manifest.sourceUrl)
            "KSTARTUP" -> kStartup.collect(manifest.sourceCode, manifest.sourceProgramId, manifest.sourceUrl)
            "CNTRADE_NOTICE" -> {
                val program = details.get(manifest.sourceCode, manifest.sourceProgramId)
                cnTrade.collect(manifest.sourceCode, manifest.sourceProgramId, program.title, program.targetDescription)
            }
            else -> throw ApplicationDocumentException("APPLICATION_DOCUMENT_UNSUPPORTED", "원본 첨부를 확보할 수 없는 제공처입니다.")
        }
        val original = collected.files.find { MessageDigest.getInstance("SHA-256").digest(it.bytes).joinToString("") { b -> "%02x".format(b) } == manifest.attachmentSha256 }
            ?: throw ApplicationDocumentException("APPLICATION_DOCUMENT_SOURCE_CHANGED", "공식 첨부가 변경되었거나 없어졌습니다. 공고에서 양식을 다시 찾아 새 작성을 시작해 주세요.")
        val inspection = editor.inspect(original.bytes, original.format)
        // Exact, unique option captions are native form values, not free-text insertion locations.
        fun normalized(value: String) = value.replace(Regex("\\s+"), "")
        val choices = facts.mapNotNull { fact ->
            inspection.targets.filter { it.kind == "CHECKBOX" && normalized(it.text) == normalized(fact.value) }.singleOrNull()
                ?.let { ApplicationDocumentPlacement(fact.id, it.id) }
        }
        val remaining = facts.filter { fact -> choices.none { it.factId == fact.id } }
        val examples = inspection.targets.filter { it.exampleText.isNotBlank() }.map { it.id }.toSet()
        val result = if (remaining.isEmpty() && examples.isEmpty()) AiApplicationDocumentPayload("application-document-v1", choices, emptyList())
        else ai.placeDocument(AiApplicationDocumentRequest(facts = remaining, targets = inspection.targets, pageImages = inspection.pageImages)).let { it.copy(placements = it.placements + choices) }
        val targetIds = inspection.targets.map { it.id }.toSet()
        if (result.contractVersion != "application-document-v1" || result.unmappedFactIds.isNotEmpty() || result.placements.size != facts.size || result.placements.map { it.factId }.toSet() != facts.map { it.id }.toSet() || result.placements.any { it.targetId !in targetIds }) {
            throw ApplicationDocumentException("APPLICATION_DOCUMENT_MAPPING_FAILED", "일부 답변의 기입 위치를 확인하지 못해 파일을 생성하지 않았습니다. 공식 양식과 답변을 확인해 주세요.")
        }
        if (result.clearExampleTargetIds.distinct().size != result.clearExampleTargetIds.size || result.clearExampleTargetIds.any { it !in examples } || result.placements.any { it.targetId in examples && it.targetId !in result.clearExampleTargetIds }) {
            throw ApplicationDocumentException("APPLICATION_DOCUMENT_MAPPING_FAILED", "예시 문구와 답변의 기입 위치를 구분하지 못했습니다.")
        }
        if (result.preserveExampleTargetIds.distinct().size != result.preserveExampleTargetIds.size ||
            result.clearExampleTargetIds.any { it in result.preserveExampleTargetIds } ||
            (result.clearExampleTargetIds + result.preserveExampleTargetIds).toSet() != examples) {
            throw ApplicationDocumentException("APPLICATION_DOCUMENT_MAPPING_FAILED", "답변이 없는 칸을 포함한 예시·안내 문구 분류가 완료되지 않았습니다.")
        }
        val bytes = editor.fill(original.bytes, original.format, facts, result.placements, result.clearExampleTargetIds)
        val format = original.format.lowercase()
        val fileName = manifest.attachmentFileName.replace(Regex("(?i)\\.(hwp|hwpx|pdf).*$"), "").replace(Regex("[\\\\/:*?\"<>|]"), "_").take(430) + "_초안_v$expectedRevision.$format"
        val mediaType = when (format) { "pdf" -> "application/pdf"; "hwpx" -> "application/hwp+zip"; else -> "application/x-hwp" }
        listOf(files.save(account.id, id, expectedRevision, fileName, mediaType, bytes, manifest.attachmentSha256, result.placements, result.clearExampleTargetIds))
        } finally { running.remove(id) }
    }
}
