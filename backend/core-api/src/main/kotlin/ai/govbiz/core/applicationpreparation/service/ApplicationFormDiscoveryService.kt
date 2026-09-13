package ai.govbiz.core.applicationpreparation.service

import ai.govbiz.core._common.exception.AiServiceCallException
import ai.govbiz.core.account.domain.Account
import ai.govbiz.core.applicationpreparation.client.ai.exception.AiApplicationFormValidationException
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryBlock
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryDocument
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryInput
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryResult
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormFieldDefinition
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormManifest
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormSectionDefinition
import ai.govbiz.core.applicationpreparation.domain.ApplicationServiceField
import ai.govbiz.core.applicationpreparation.facade.AiApplicationPreparationFacade
import ai.govbiz.core.applicationpreparation.repository.ApplicationFormSnapshotRepository
import ai.govbiz.core.applicationpreparation.service.exception.ApplicationFormDiscoveryException
import ai.govbiz.core.applicationpreparation.service.exception.ApplicationFormDiscoveryException.Reason
import ai.govbiz.core.supportprogram.client.bizinfo.BizInfoAttachmentClient
import ai.govbiz.core.supportprogram.client.cntradenotice.CnTradeNoticeAttachmentClient
import ai.govbiz.core.supportprogram.client.document.SupportProgramDocumentParser
import ai.govbiz.core.supportprogram.client.document.SupportProgramDocumentException
import ai.govbiz.core.supportprogram.client.kstartup.KStartupAttachmentClient
import ai.govbiz.core.supportprogram.client.msit.MsitAttachmentClient
import ai.govbiz.core.supportprogram.service.admission.SupportProgramRequestAdmissionService
import ai.govbiz.core.supportprogram.service.detail.SupportProgramDetailService
import ai.govbiz.core.supportprogram.service.detail.exception.SupportProgramNotFoundException
import java.security.MessageDigest
import org.springframework.stereotype.Service

/** 사용자가 선택한 지원 공고의 제공처별 공식 첨부를 분석해 재사용 가능한 양식 스냅샷을 만듭니다. */
@Service
class ApplicationFormDiscoveryService(
    private val details: SupportProgramDetailService,
    private val bizInfoAttachments: BizInfoAttachmentClient,
    private val msitAttachments: MsitAttachmentClient,
    private val kStartupAttachments: KStartupAttachmentClient,
    private val cnTradeNoticeAttachments: CnTradeNoticeAttachmentClient,
    private val parser: SupportProgramDocumentParser,
    private val ai: AiApplicationPreparationFacade,
    private val snapshots: ApplicationFormSnapshotRepository,
    private val admission: SupportProgramRequestAdmissionService,
) {
    fun discover(account: Account, sourceCode: String, sourceProgramId: String): ApplicationFormDiscoveryResult {
        require(account.id > 0)
        validateIdentity(sourceCode, sourceProgramId)
        return admission.execute("application-form-discovery-account:${account.id}") {
            discoverQueued(sourceCode, sourceProgramId) {}
        }
    }

    fun validateIdentity(sourceCode: String, sourceProgramId: String) {
        val validIdentity = when (sourceCode) {
            "BIZINFO" -> Regex("PBLN_[0-9]{1,32}").matches(sourceProgramId)
            "MSIT", "KSTARTUP", "CNTRADE_NOTICE" -> Regex("[1-9][0-9]{0,254}").matches(sourceProgramId)
            else -> false
        }
        if (!validIdentity) {
            throw ApplicationFormDiscoveryException(Reason.SOURCE_UNSUPPORTED)
        }
    }

    /** 큐 실행권과 동시 실행 슬롯은 호출 Service가 소유한다. 유료 호출 직전에 실행권을 재확인한다. */
    fun discoverQueued(sourceCode: String, sourceProgramId: String, beforeAi: () -> Unit): ApplicationFormDiscoveryResult {
        validateIdentity(sourceCode, sourceProgramId)
        val program = try {
            details.get(sourceCode, sourceProgramId)
        } catch (error: SupportProgramNotFoundException) {
            throw ApplicationFormDiscoveryException(Reason.SOURCE_NOT_FOUND, error)
        }
        val configuration = ai.discoveryConfiguration()
        return discoverFresh(
                program.sourceCode,
                program.id,
                program.title,
                program.targetDescription,
                program.sourceUrl,
                configuration,
                beforeAi,
            )
    }

    private fun discoverFresh(
        sourceCode: String,
        sourceProgramId: String,
        catalogTitle: String,
        catalogBody: String,
        sourceUrl: String,
        configuration: ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryConfiguration,
        beforeAi: () -> Unit,
    ): ApplicationFormDiscoveryResult {
        return try {
            val collected = when (sourceCode) {
                "BIZINFO" -> bizInfoAttachments.collect(sourceCode, sourceProgramId)
                "MSIT" -> msitAttachments.collect(sourceCode, sourceProgramId, sourceUrl)
                "KSTARTUP" -> kStartupAttachments.collect(sourceCode, sourceProgramId, sourceUrl)
                "CNTRADE_NOTICE" -> cnTradeNoticeAttachments.collect(sourceCode, sourceProgramId, catalogTitle, catalogBody)
                else -> throw ApplicationFormDiscoveryException(Reason.SOURCE_UNSUPPORTED)
            }
            val warnings = collected.warnings.toMutableList()
            val sourceFingerprint = sha256(collected.files.joinToString("\n") { file ->
                "${file.sourceUrl}\u0000${file.fileName}\u0000${sha256(file.bytes)}"
            }.toByteArray())
            snapshots.findByProgram(
                sourceCode, sourceProgramId, sourceFingerprint, SupportProgramDocumentParser.VERSION,
                configuration.model, configuration.promptVersion,
            )
                .takeIf { it.isNotEmpty() }?.let { cached ->
                    return ApplicationFormDiscoveryResult(
                        cached,
                        warnings + "동일한 공식 첨부에서 이전에 추출한 양식을 재사용했습니다.",
                        true,
                    )
                }
            val documents = collected.files.mapIndexedNotNull { documentIndex, file ->
                val blocks = try {
                    parser.parse(file.bytes, file.format)
                } catch (error: SupportProgramDocumentException) {
                    if (error.reason !in setOf(
                            SupportProgramDocumentException.Reason.UNSUPPORTED,
                            SupportProgramDocumentException.Reason.TOO_LARGE,
                        )) throw error
                    warnings.add("자동 분석 제외 첨부(SOURCE_${error.reason.name}): ${file.fileName.take(250)}")
                    return@mapIndexedNotNull null
                }
                ApplicationFormDiscoveryDocument(
                    documentIndex,
                    file.sourceUrl,
                    file.fileName,
                    file.format,
                    file.bytes.size.toLong(),
                    sha256(file.bytes),
                    blocks.mapIndexed { blockIndex, block ->
                        ApplicationFormDiscoveryBlock("D$documentIndex-B$blockIndex", block.locator, block.text)
                    },
                )
            }
            if (documents.isEmpty()) throw ApplicationFormDiscoveryException(Reason.SOURCE_UNSUPPORTED)
            if (documents.sumOf { document -> document.blocks.sumOf { it.text.length } } > 120_000) {
                throw ApplicationFormDiscoveryException(Reason.SOURCE_TOO_LARGE)
            }
            val input = ApplicationFormDiscoveryInput(
                sourceCode,
                sourceProgramId,
                collected.programTitle.ifBlank { catalogTitle },
                sourceUrl,
                documents,
            )
            beforeAi()
            val extracted = ai.discover(input, configuration)
            if (extracted.isEmpty()) throw ApplicationFormDiscoveryException(Reason.NO_FORM)
            val forms = try {
                extracted.map { candidate ->
                    val document = requireNotNull(documents.find { it.documentIndex == candidate.documentIndex })
                    val blockById = document.blocks.associateBy { it.blockId }
                    ApplicationFormManifest(
                        schemaVersion = 1,
                        formVersionId = formVersionId(
                            sourceCode, sourceProgramId, document.sha256, configuration.model, configuration.promptVersion,
                        ),
                        sourceCode = sourceCode,
                        sourceProgramId = sourceProgramId,
                        programTitle = input.programTitle,
                        formTitle = document.fileName.replace(Regex("(?i)\\.(pdf|hwp|hwpx).*"), "").trim().take(300),
                        sourceUrl = input.programSourceUrl,
                        attachmentFileName = document.fileName,
                        attachmentBytes = document.bytes,
                        attachmentSha256 = document.sha256,
                        verificationStatus = "SOURCE_DOCUMENT_EXTRACTED",
                        institutionReviewed = false,
                        supportedServiceFields = listOf(ApplicationServiceField.GENERAL),
                        sections = candidate.sections.map { section ->
                            val locator = section.fields.map { field -> requireNotNull(blockById[field.evidenceBlockId]).locator }
                                .distinct().joinToString(", ").trim().take(200)
                            ApplicationFormSectionDefinition(
                                section.key,
                                section.title,
                                locator,
                                section.description,
                                section.fields.map { field ->
                                    ApplicationFormFieldDefinition(field.key, field.label, field.guidance, field.required, field.options)
                                },
                            )
                        },
                    )
                }
            } catch (error: IllegalArgumentException) {
                throw AiServiceCallException.invalidResponse("Application form discovery output could not form a safe manifest", error)
            }
            snapshots.save(forms, sourceFingerprint, SupportProgramDocumentParser.VERSION, configuration)
            val storedForms = forms.map { form -> requireNotNull(snapshots.findByVersion(form.formVersionId)) }
            ApplicationFormDiscoveryResult(storedForms, warnings.distinct(), false)
        } catch (error: AiApplicationFormValidationException) {
            throw ApplicationFormDiscoveryException(Reason.AI_INVALID_RESPONSE, error)
        } catch (error: ApplicationFormDiscoveryException) {
            throw error
        } catch (error: SupportProgramDocumentException) {
            throw ApplicationFormDiscoveryException(
                when (error.reason) {
                    SupportProgramDocumentException.Reason.UNSUPPORTED -> Reason.SOURCE_UNSUPPORTED
                    SupportProgramDocumentException.Reason.NOT_FOUND -> Reason.SOURCE_NOT_FOUND
                    SupportProgramDocumentException.Reason.UNAVAILABLE -> Reason.SOURCE_UNAVAILABLE
                    SupportProgramDocumentException.Reason.INVALID -> Reason.SOURCE_INVALID
                    SupportProgramDocumentException.Reason.TOO_LARGE -> Reason.SOURCE_TOO_LARGE
                },
                error,
            )
        } catch (error: AiServiceCallException) {
            throw error
        } catch (error: IllegalArgumentException) {
            throw ApplicationFormDiscoveryException(Reason.SOURCE_INVALID, error)
        }
    }

    private fun formVersionId(
        sourceCode: String,
        sourceProgramId: String,
        documentHash: String,
        model: String,
        promptVersion: String,
    ): String {
        val versionHash = sha256(
            "$documentHash\u0000${SupportProgramDocumentParser.VERSION}\u0000$model\u0000$promptVersion".toByteArray(),
        )
        val source = sourceCode.lowercase().replace('_', '-')
        val hash = versionHash.take(28)
        val program = sourceProgramId.lowercase().replace('_', '-')
            .take(160 - source.length - hash.length - 2)
        return "$source-$program-$hash"
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it) }
}
