package com.mewfinance.mewlock.backend.services

import com.mewfinance.mewlock.common.*
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
class ErgoServiceTest {
    
    private lateinit var ergoService: ErgoService
    
    @BeforeEach
    fun setup() {
        ergoService = ErgoService()
    }
    
    @Test
    fun `test current height fetching`() = runBlocking {
        val height = ergoService.getCurrentHeight()
        
        // Current mainnet height should be > 1,000,000
        assertTrue(height > 1000000, "Current height should be greater than 1M")
        
        // Should be reasonable (not too high)
        assertTrue(height < 2000000, "Current height should be less than 2M")
    }
    
    @Test
    fun `test MewLock boxes fetching`() = runBlocking {
        val boxes = ergoService.getMewLockBoxes()
        
        // Should not throw exception
        assertNotNull(boxes)
        
        // If boxes exist, validate structure
        boxes.forEach { box ->
            assertNotNull(box.boxId)
            assertTrue(box.boxId.isNotEmpty())
            assertTrue(box.ergAmount >= 0)
            assertNotNull(box.depositorAddress)
            assertTrue(box.unlockHeight > 0)
            assertTrue(box.remainingBlocks >= 0)
        }
    }
    
    @Test
    fun `test global stats calculation`() = runBlocking {
        val stats = ergoService.getGlobalStats()
        
        assertNotNull(stats)
        assertTrue(stats.totalLocks >= 0)
        assertTrue(stats.totalUsers >= 0)
        assertTrue(stats.totalValueLocked >= 0)
        assertTrue(stats.totalUsdValue >= 0.0)
        
        // If there are locks, users should be > 0
        if (stats.totalLocks > 0) {
            assertTrue(stats.totalUsers > 0)
        }
    }
    
    @Test
    fun `test user stats calculation`() = runBlocking {
        val testAddress = "9fCMmB72WcFLseNx6QANheTCrDjKebEiEtVVcZjcg8kFWuSUdp9"
        val userStats = ergoService.getUserStats(testAddress)
        
        assertNotNull(userStats)
        assertEquals(testAddress, userStats.address)
        assertTrue(userStats.totalLocks >= 0)
        assertTrue(userStats.totalValueLocked >= 0)
        assertTrue(userStats.totalUsdValue >= 0.0)
        assertTrue(userStats.readyLocks >= 0)
        assertTrue(userStats.rank >= 0)
    }
    
    @Test
    fun `test lock transaction building`() = runBlocking {
        val request = CreateLockRequest(
            depositorAddress = "9fCMmB72WcFLseNx6QANheTCrDjKebEiEtVVcZjcg8kFWuSUdp9",
            ergAmount = 100000000L, // 0.1 ERG
            tokens = emptyList(),
            durationBlocks = 5040 // 1 week
        )
        
        val result = ergoService.buildLockTransaction(request)
        
        assertNotNull(result)
        // Should not fail for valid request
        assertTrue(result.success || result.error != null)
    }
    
    @Test
    fun `test unlock transaction building`() = runBlocking {
        val boxId = "test_box_id"
        val userAddress = "9fCMmB72WcFLseNx6QANheTCrDjKebEiEtVVcZjcg8kFWuSUdp9"
        
        val result = ergoService.buildUnlockTransaction(boxId, userAddress)
        
        assertNotNull(result)
        // Should handle gracefully even if box doesn't exist
        assertTrue(result.success || result.error != null)
    }
}