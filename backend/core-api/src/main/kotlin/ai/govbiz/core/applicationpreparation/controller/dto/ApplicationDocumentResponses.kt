package ai.govbiz.core.applicationpreparation.controller.dto

import jakarta.validation.constraints.Min

data class GenerateApplicationDocumentsRequest(@field:Min(1) val expectedRevision: Long)
data class ApplicationDocumentResponse(val id: Long, val inputRevision: Long, val fileName: String, val mediaType: String, val size: Int)
