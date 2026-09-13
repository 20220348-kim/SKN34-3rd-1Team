package ai.govbiz.core.applicationpreparation.repository

import ai.govbiz.core._common.test.MySqlTestContainerConfig
import ai.govbiz.core.account.domain.NewAccount
import ai.govbiz.core.account.repository.AccountRepository
import ai.govbiz.core.applicationpreparation.domain.ApplicationServiceField
import ai.govbiz.core.applicationpreparation.domain.ApplicationProgressStage
import ai.govbiz.core.applicationpreparation.domain.ApplicationProgressUpdateResult
import ai.govbiz.core.applicationpreparation.domain.NewApplicationPreparation
import ai.govbiz.core.applicationpreparation.domain.ApplicationFactStatus
import ai.govbiz.core.applicationpreparation.domain.ApplicationInputReplaceResult
import ai.govbiz.core.applicationpreparation.domain.NewConfirmedApplicationFact
import java.time.LocalDateTime
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(properties = [
    "app.account.jwt-secret=test-jwt-secret-0123456789abcdef0123456789",
    "app.ai-service.base-url=http://127.0.0.1:1",
    "app.bizinfo.sync.enabled=false",
    "app.support-program-index.enabled=false",
])
@Import(MySqlTestContainerConfig::class)
class ApplicationPreparationRepositoryIntegrationTest {
    @Autowired private lateinit var repository: ApplicationPreparationRepository
    @Autowired private lateinit var inputs: ApplicationPreparationInputRepository
    @Autowired private lateinit var accounts: AccountRepository
    @Autowired private lateinit var jdbc: JdbcTemplate
    private var ownerId = 0L
    private var otherId = 0L

    @BeforeEach
    fun prepare() {
        jdbc.update("DELETE FROM application_preparation")
        ownerId = createAccount()
        otherId = createAccount()
    }

    @Test
    fun roundTripsEveryServiceFieldAndKeepsOwnerIsolation() {
        val created = ApplicationServiceField.entries.map { field -> repository.create(ownerId, draft(field)) }
        assertTrue(created.all {
            it.inputRevision == 1L && it.ownerAccountId == ownerId &&
                it.progressStage == ApplicationProgressStage.PREPARING && it.progressRevision == 1L
        })
        assertEquals(ApplicationServiceField.entries, repository.listOwned(ownerId, null, 51).reversed().map { it.serviceField })
        assertNull(repository.findOwned(otherId, created.first().id))
        assertEquals(created.first(), repository.findOwned(ownerId, created.first().id))
    }

    @Test
    fun updatesProgressWithOwnerAndIndependentRevisionProtection() {
        val created = repository.create(ownerId, draft())
        val updated = repository.updateProgressOwned(
            ownerId,
            created.id,
            created.progressRevision,
            ApplicationProgressStage.DOCUMENT_REVIEW,
        ) as ApplicationProgressUpdateResult.Updated

        assertEquals(ApplicationProgressStage.DOCUMENT_REVIEW, updated.preparation.progressStage)
        assertEquals(2L, updated.preparation.progressRevision)
        assertEquals(1L, updated.preparation.inputRevision)
        assertEquals(
            ApplicationProgressUpdateResult.RevisionConflict,
            repository.updateProgressOwned(ownerId, created.id, 1, ApplicationProgressStage.SELECTED),
        )
        assertEquals(
            ApplicationProgressUpdateResult.NotFound,
            repository.updateProgressOwned(otherId, created.id, 2, ApplicationProgressStage.SELECTED),
        )
    }

    @Test
    fun paginatesOnlyTheOwnerByStableDescendingId() {
        val oldest = repository.create(ownerId, draft()).id
        repository.create(otherId, draft())
        val middle = repository.create(ownerId, draft()).id
        val newest = repository.create(ownerId, draft()).id
        val first = repository.listOwned(ownerId, null, 2)
        val second = repository.listOwned(ownerId, middle, 2)
        assertEquals(listOf(newest, middle), first.map { it.id })
        assertEquals(listOf(oldest), second.map { it.id })
    }

    @Test
    fun enforcesOwnerFieldFormAndRevisionConstraintsInMysql() {
        assertThrows(DataAccessException::class.java) { repository.create(Long.MAX_VALUE, draft()) }
        val created = repository.create(ownerId, draft())
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE application_preparation SET service_field = 'INVALID' WHERE id = ?", created.id)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE application_preparation SET input_revision = 0 WHERE id = ?", created.id)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE application_preparation SET progress_stage = 'INVALID' WHERE id = ?", created.id)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE application_preparation SET progress_revision = 0 WHERE id = ?", created.id)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE application_preparation SET form_version_id = '잘못된-버전' WHERE id = ?", created.id)
        }
        assertEquals(created, repository.findOwned(ownerId, created.id))
    }

    @Test
    fun replacesKoreanSpecialCharacterAndUnknownFactsInOneRevision() {
        val created = repository.create(ownerId, draft())
        val result = inputs.replaceOwned(ownerId, created.id, "company-overview", 1, listOf(
            NewConfirmedApplicationFact("company-name", ApplicationFactStatus.PROVIDED, "새봄테크 & 연구소", "업체명은 ‘새봄테크 & 연구소’입니다."),
            NewConfirmedApplicationFact("contact-person", ApplicationFactStatus.UNKNOWN, null, "담당자는 아직 미정입니다."),
        ))
        assertEquals(ApplicationInputReplaceResult.Updated(2), result)
        val facts = inputs.listOwnedFacts(ownerId, created.id)
        assertEquals(listOf("새봄테크 & 연구소", null), facts.map { it.value })
        assertEquals(listOf(ApplicationFactStatus.PROVIDED, ApplicationFactStatus.UNKNOWN), facts.map { it.status })
        assertEquals(2L, repository.findOwned(ownerId, created.id)!!.inputRevision)
        assertTrue(inputs.listOwnedFacts(otherId, created.id).isEmpty())
    }

    @Test
    fun duplicateSnapshotRollsBackDeletedFactsAndRevision() {
        val created = repository.create(ownerId, draft())
        val original = NewConfirmedApplicationFact("company-name", ApplicationFactStatus.PROVIDED, "기존 업체", "기존 답변")
        inputs.replaceOwned(ownerId, created.id, "company-overview", 1, listOf(original))
        assertThrows(DataAccessException::class.java) {
            inputs.replaceOwned(ownerId, created.id, "company-overview", 2, listOf(original, original))
        }
        assertEquals("기존 업체", inputs.listOwnedFacts(ownerId, created.id).single().value)
        assertEquals(2L, repository.findOwned(ownerId, created.id)!!.inputRevision)
    }

    @Test
    fun deletesOnlyTheOwnedPreparationAndCascadesItsConfirmedFacts() {
        val created = repository.create(ownerId, draft())
        inputs.replaceOwned(ownerId, created.id, "company-overview", 1, listOf(
            NewConfirmedApplicationFact("company-name", ApplicationFactStatus.PROVIDED, "삭제할 업체", "삭제할 답변"),
        ))

        assertTrue(!repository.deleteOwned(otherId, created.id))
        assertTrue(repository.deleteOwned(ownerId, created.id))
        assertNull(repository.findOwned(ownerId, created.id))
        assertEquals(0, jdbc.queryForObject(
            "SELECT COUNT(*) FROM application_preparation_fact WHERE preparation_id = ?",
            Int::class.java,
            created.id,
        ))
    }

    private fun createAccount(): Long = accounts.createAccount(
        NewAccount("application-${UUID.randomUUID()}@example.test", "test-password-hash", LocalDateTime.of(2026, 9, 11, 0, 0)),
    ).id

    private fun draft(field: ApplicationServiceField = ApplicationServiceField.TECHNICAL_SUPPORT) = NewApplicationPreparation(
        "BIZINFO",
        "PBLN_000000000118979",
        "bizinfo-pbln-000000000118979-innovation-voucher-2026-v1",
        field,
    )
}
