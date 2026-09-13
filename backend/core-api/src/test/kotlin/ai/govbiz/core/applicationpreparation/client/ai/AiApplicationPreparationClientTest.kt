package ai.govbiz.core.applicationpreparation.client.ai

import ai.govbiz.core._common.exception.AiServiceCallException
import ai.govbiz.core._common.exception.AiServiceFailure
import ai.govbiz.core.applicationpreparation.client.ai.dto.AiApplicationFormDiscoveryRequest
import ai.govbiz.core.applicationpreparation.client.ai.exception.AiApplicationFormValidationException
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryBlock
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryDocument
import ai.govbiz.core.applicationpreparation.domain.ApplicationFormDiscoveryInput
import ai.govbiz.core.applicationpreparation.facade.AiApplicationPreparationFacade
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.restclient.test.autoconfigure.RestClientTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.content
import org.springframework.test.web.client.match.MockRestRequestMatchers.method
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.test.web.client.response.MockRestResponseCreators.withStatus
import org.springframework.web.client.RestClient
import tools.jackson.databind.ObjectMapper

/** AI Service producer test와 공유하는 JSON으로 HTTP 디코딩과 Facade 검증을 함께 확인합니다. */
@RestClientTest(AiApplicationPreparationClient::class)
@Import(AiApplicationPreparationClientTest.Config::class)
class AiApplicationPreparationClientTest {
    @Autowired private lateinit var client: AiApplicationPreparationClient
    @Autowired private lateinit var server: MockRestServiceServer
    @Autowired private lateinit var json: ObjectMapper

    @Test
    fun distinguishesConfirmedValidationFailureFromUnknownExecutionErrors() {
        val request = json.readValue(resource("discovery-contract-request.json"), AiApplicationFormDiscoveryRequest::class.java)
        server.expect(requestTo("http://ai.test/internal/v1/application-preparations/discovery"))
            .andRespond(withStatus(HttpStatus.UNPROCESSABLE_CONTENT).contentType(MediaType.APPLICATION_JSON)
                .body("""{"detail":{"code":"APPLICATION_FORM_AI_INVALID_RESPONSE"}}"""))
        assertThrows(AiApplicationFormValidationException::class.java) { client.discover(request) }
        server.verify()
        server.reset()
        for ((status, body, expected) in listOf(
            Triple(HttpStatus.UNPROCESSABLE_CONTENT, """{"detail":{"code":"REQUEST_VALIDATION_FAILED"}}""", AiServiceFailure.UNAVAILABLE),
            Triple(HttpStatus.SERVICE_UNAVAILABLE, """{"detail":{"code":"APPLICATION_PREPARATION_FAILED"}}""", AiServiceFailure.INVALID_RESPONSE),
            Triple(HttpStatus.GATEWAY_TIMEOUT, "{}", AiServiceFailure.TIMEOUT),
        )) {
            server.expect(requestTo("http://ai.test/internal/v1/application-preparations/discovery"))
                .andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON).body(body))
            assertEquals(expected, assertThrows(AiServiceCallException::class.java) { client.discover(request) }.failure)
            server.verify()
            server.reset()
        }
    }

    @Test
    fun decodesAndValidatesTheSharedDiscoveryContractIncludingCanonicalSourceWhitespace() {
        val requestBody = resource("discovery-contract-request.json")
        val responseBody = resource("discovery-contract-response.json")
        val request = json.readValue(requestBody, AiApplicationFormDiscoveryRequest::class.java)
        val expected = json.readTree(responseBody)
        val configurationBody = """{"contractVersion":"${expected["contractVersion"].asString()}","model":"${expected["model"].asString()}","promptVersion":"${expected["promptVersion"].asString()}"}"""
        server.expect(requestTo("http://ai.test/internal/v1/application-preparations/discovery/configuration"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(configurationBody, MediaType.APPLICATION_JSON))
        server.expect(requestTo("http://ai.test/internal/v1/application-preparations/discovery"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json(requestBody))
            .andRespond(withSuccess(responseBody, MediaType.APPLICATION_JSON))
        val facade = AiApplicationPreparationFacade(client)

        val result = facade.discover(input(request), facade.discoveryConfiguration()).single()

        assertEquals("사업 계획", result.sections.single().title)
        assertEquals("사업 개요", result.sections.single().fields.single().label)
        assertEquals("사업\n개요", result.sections.single().fields.single().evidenceQuote)
        server.verify()
    }

    @Test
    fun logsOnlyTheSafeJsonPathAndRequestCountsWhenDiscoveryCannotBeDecoded() {
        val requestBody = resource("discovery-contract-request.json")
        val request = json.readValue(requestBody, AiApplicationFormDiscoveryRequest::class.java)
        val invalidBody = resource("discovery-contract-response.json")
            .replace("\"label\": \"사업 개요\"", "\"label\": {\"unexpected\":true}")
        server.expect(requestTo("http://ai.test/internal/v1/application-preparations/discovery"))
            .andRespond(withSuccess(invalidBody, MediaType.APPLICATION_JSON))
        val logger = LoggerFactory.getLogger(AiApplicationPreparationClient::class.java) as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)

        val failure = try {
            assertThrows(AiServiceCallException::class.java) { client.discover(request) }
        } finally {
            logger.detachAppender(appender)
            appender.stop()
        }

        assertEquals(AiServiceFailure.INVALID_RESPONSE, failure.failure)
        val diagnostic = appender.list.joinToString("\n") { it.formattedMessage }
        assertTrue(diagnostic.contains("stage=decode"))
        assertTrue(diagnostic.contains("path=forms[0].sections[0].fields[0].label"))
        assertTrue(diagnostic.contains("documentCount=1"))
        assertTrue(diagnostic.contains("blockCount=1"))
        assertTrue(!diagnostic.contains("사업 개요"))
        server.verify()
    }

    private fun input(request: AiApplicationFormDiscoveryRequest) = ApplicationFormDiscoveryInput(
        request.sourceCode,
        request.sourceProgramId,
        request.programTitle,
        "https://www.bizinfo.go.kr/program",
        request.documents.map { document ->
            ApplicationFormDiscoveryDocument(
                document.documentIndex,
                "https://www.bizinfo.go.kr/file",
                document.fileName,
                document.format,
                1,
                "a".repeat(64),
                document.blocks.map { ApplicationFormDiscoveryBlock(it.blockId, it.locator, it.text) },
            )
        },
    )

    private fun resource(name: String) = requireNotNull(
        javaClass.getResourceAsStream("/applicationpreparation/$name"),
    ).bufferedReader().use { it.readText() }

    @TestConfiguration(proxyBeanMethods = false)
    class Config {
        @Bean("aiServiceRestClient")
        fun restClient(builder: RestClient.Builder): RestClient = builder.baseUrl("http://ai.test").build()
    }
}
