package ai.govbiz.core.applicationpreparation.domain

/** 좌표는 회전된 PDF 페이지의 왼쪽 위를 기준으로 0..1로 정규화한다. */
data class ApplicationDocumentBox(val x: Float, val y: Float, val width: Float, val height: Float)
data class ApplicationDocumentTarget(val id: String, val text: String, val context: String, val exampleText: String = "", val kind: String = "TEXT", val groupId: String = "")
data class ApplicationDocumentFact(val id: String, val label: String, val value: String)
data class ApplicationDocumentPlacement(val factId: String, val targetId: String, val box: ApplicationDocumentBox? = null)
data class ApplicationDocumentInspection(val targets: List<ApplicationDocumentTarget>, val pageImages: List<String> = emptyList(), val pdfFields: List<Map<String, Any?>> = emptyList())
data class ApplicationDocumentFile(val id: Long, val inputRevision: Long, val fileName: String, val mediaType: String, val bytes: ByteArray)

/** Shared official-form address binding; contains no user answers. */
data class ApplicationDocumentMapSnapshot(
    val contractVersion: String,
    val pipelineVersion: String,
    val sourceSha256: String,
    val mapVersion: String,
    val engineVersion: String,
    val bindings: List<ApplicationDocumentPlacement>,
    val scopeTargetIds: List<String>,
    val documentMap: Map<String, Any?>,
)
