package ai.govbiz.core.applicationpreparation.repository

import ai.govbiz.core.applicationpreparation.domain.ApplicationDocumentFile
import ai.govbiz.core.applicationpreparation.domain.ApplicationDocumentPlacement
import ai.govbiz.core.applicationpreparation.domain.exception.ApplicationPreparationNotFoundException
import ai.govbiz.core.applicationpreparation.domain.exception.ApplicationPreparationRevisionConflictException
import ai.govbiz.core.applicationpreparation.repository.mapper.ApplicationDocumentDbRow
import ai.govbiz.core.applicationpreparation.repository.mapper.ApplicationDocumentMapper
import ai.govbiz.core.applicationpreparation.repository.mapper.ApplicationPreparationInputMapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper

@Repository
class ApplicationDocumentRepository(private val mapper: ApplicationDocumentMapper, private val inputs: ApplicationPreparationInputMapper, private val json: ObjectMapper) {
    fun findRevision(ownerId: Long, preparationId: Long, revision: Long) = mapper.findRevision(ownerId, preparationId, revision, 4)?.toDomain()
    fun findOwned(ownerId: Long, preparationId: Long, fileId: Long) = mapper.findOwned(ownerId, preparationId, fileId)?.toDomain()

    @Transactional
    fun save(ownerId: Long, preparationId: Long, revision: Long, fileName: String, mediaType: String, bytes: ByteArray, sourceSha256: String, placements: List<ApplicationDocumentPlacement>, clearExampleTargetIds: List<String> = emptyList()): ApplicationDocumentFile {
        val current = inputs.lockOwnedRevision(ownerId, preparationId) ?: throw ApplicationPreparationNotFoundException()
        if (current != revision) throw ApplicationPreparationRevisionConflictException()
        findRevision(ownerId, preparationId, revision)?.let { return it }
        val row = ApplicationDocumentDbRow(preparationId = preparationId, inputRevision = revision, fileName = fileName, mediaType = mediaType, fileBytes = bytes, sourceSha256 = sourceSha256, placementsJson = json.writeValueAsString(mapOf("placements" to placements, "clearExampleTargetIds" to clearExampleTargetIds)))
        check(mapper.insert(row) == 1)
        return row.toDomain()
    }

    private fun ApplicationDocumentDbRow.toDomain() = ApplicationDocumentFile(id, inputRevision, fileName, mediaType, fileBytes)
}
