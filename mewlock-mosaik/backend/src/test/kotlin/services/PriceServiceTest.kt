package com.mewfinance.mewlock.backend.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
class PriceServiceTest {
    
    private lateinit var priceService: PriceService
    
    @BeforeEach
    fun setup() {
        priceService = PriceService()
    }
    
    @Test
    fun `test ERG price fetching`() = runBlocking {
        val price = priceService.getErgPrice()
        
        // Price should be positive (unless network error)
        assertTrue(price >= 0.0)
        
        if (price > 0) {
            // ERG price should be reasonable (between $0.01 and $100)
            assertTrue(price > 0.01)
            assertTrue(price < 100.0)
        }
    }
    
    @Test
    fun `test USD value calculation`() {
        val ergAmount = 1000000000L // 1 ERG in nanoERG
        val tokenAmounts = listOf(
            "tokenId1" to 1000L,
            "tokenId2" to 2000L
        )
        
        val usdValue = priceService.calculateUsdValue(ergAmount, tokenAmounts)
        
        // Should handle calculation without throwing
        assertTrue(usdValue >= 0.0)
    }
    
    @Test
    fun `test ERG formatting`() {
        assertEquals("1.0000 ERG", priceService.formatErg(1000000000L))
        assertEquals("0.1000 ERG", priceService.formatErg(100000000L))
        assertEquals("1.2K ERG", priceService.formatErg(1200000000000L))
        assertEquals("1.50M ERG", priceService.formatErg(1500000000000000L))
    }
    
    @Test
    fun `test USD formatting`() {
        assertEquals("$1.00", priceService.formatUsd(1.0))
        assertEquals("$1.5K", priceService.formatUsd(1500.0))
        assertEquals("$2.50M", priceService.formatUsd(2500000.0))
    }
    
    @Test
    fun `test price caching`() = runBlocking {
        // First call
        val price1 = priceService.getErgPrice()
        
        // Second call should use cache
        val price2 = priceService.getErgPrice()
        
        // Should be the same if cached
        assertEquals(price1, price2)
    }
}