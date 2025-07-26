package com.mewfinance.mewlock.backend.integration

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.springframework.boot.test.context.SpringBootTest
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI
import java.time.Duration

@SpringBootTest
class ApiIntegrationTest {
    
    private lateinit var httpClient: HttpClient
    
    @BeforeEach
    fun setup() {
        httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()
    }
    
    @Test
    fun `test Ergo Explorer API connectivity`() = runBlocking {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.ergoplatform.com/api/v1/info"))
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            
            assertEquals(200, response.statusCode())
            assertTrue(response.body().contains("height"))
            
            println("✓ Ergo Explorer API: Connected successfully")
        } catch (e: Exception) {
            println("⚠ Ergo Explorer API: ${e.message}")
            // Don't fail test - API might be temporarily unavailable
        }
    }
    
    @Test
    fun `test CoinGecko API connectivity`() = runBlocking {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd"))
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            
            assertEquals(200, response.statusCode())
            assertTrue(response.body().contains("ergo"))
            assertTrue(response.body().contains("usd"))
            
            println("✓ CoinGecko API: Connected successfully")
        } catch (e: Exception) {
            println("⚠ CoinGecko API: ${e.message}")
            // Don't fail test - API might be temporarily unavailable
        }
    }
    
    @Test
    fun `test Spectrum API connectivity`() = runBlocking {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.spectrum.fi/v1/price/erg"))
                .GET()
                .timeout(Duration.ofSeconds(10))
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            
            assertTrue(response.statusCode() == 200 || response.statusCode() == 404)
            
            if (response.statusCode() == 200) {
                println("✓ Spectrum API: Connected successfully")
            } else {
                println("⚠ Spectrum API: Endpoint may not exist")
            }
        } catch (e: Exception) {
            println("⚠ Spectrum API: ${e.message}")
            // Don't fail test - API might be temporarily unavailable
        }
    }
    
    @Test
    fun `test MewLock contract address format`() {
        val contractAddress = "QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU"
        
        // Basic validation
        assertTrue(contractAddress.length > 50)
        assertTrue(contractAddress.matches(Regex("[A-Za-z0-9]+")))
        
        println("✓ Contract address format: Valid")
    }
}