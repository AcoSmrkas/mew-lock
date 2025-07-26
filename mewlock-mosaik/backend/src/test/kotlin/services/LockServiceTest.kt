package com.mewfinance.mewlock.backend.services

import com.mewfinance.mewlock.common.*
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.springframework.boot.test.context.SpringBootTest
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.whenever

@SpringBootTest
class LockServiceTest {
    
    @Mock
    private lateinit var ergoService: ErgoService
    
    @Mock
    private lateinit var priceService: PriceService
    
    private lateinit var lockService: LockService
    
    @BeforeEach
    fun setup() {
        MockitoAnnotations.openMocks(this)
        lockService = LockService(ergoService, priceService)
    }
    
    @Test
    fun `test fee calculation`() = runBlocking {
        val ergAmount = 1000000000L // 1 ERG
        val tokens = listOf(
            TokenAmount(
                tokenId = "test_token",
                amount = 1000L,
                name = "Test Token",
                decimals = 2
            )
        )
        
        val (ergFee, tokenFees) = lockService.calculateFees(ergAmount, tokens)
        
        // 3% fee
        assertEquals(30000000L, ergFee) // 0.03 ERG
        assertEquals(1, tokenFees.size)
        assertEquals(30L, tokenFees[0].amount) // 3% of 1000
    }
    
    @Test
    fun `test storage rent requirement`() {
        // 1 week - no storage rent
        assertFalse(lockService.isStorageRentRequired(5040))
        
        // 1 year - no storage rent
        assertFalse(lockService.isStorageRentRequired(262800))
        
        // 5 years - requires storage rent
        assertTrue(lockService.isStorageRentRequired(1314000))
        
        // 10 years - requires storage rent
        assertTrue(lockService.isStorageRentRequired(2628000))
    }
    
    @Test
    fun `test time formatting`() {
        // Minutes
        assertEquals("45m", lockService.formatTimeRemaining(22))
        
        // Hours
        assertEquals("2h 30m", lockService.formatTimeRemaining(75))
        
        // Days
        assertEquals("1d 12h", lockService.formatTimeRemaining(1080))
        
        // Weeks
        assertEquals("7d 0h", lockService.formatTimeRemaining(5040))
    }
    
    @Test
    fun `test create lock validation`() = runBlocking {
        // Valid request
        val validRequest = CreateLockRequest(
            depositorAddress = "9fCMmB72WcFLseNx6QANheTCrDjKebEiEtVVcZjcg8kFWuSUdp9",
            ergAmount = 100000000L, // 0.1 ERG
            tokens = emptyList(),
            durationBlocks = 5040
        )
        
        whenever(ergoService.buildLockTransaction(validRequest))
            .thenReturn(TransactionResult(success = true, txId = "test_tx"))
        
        val result = lockService.createLock(validRequest)
        assertTrue(result.success)
        
        // Invalid amount
        val invalidRequest = validRequest.copy(ergAmount = -1L)
        val invalidResult = lockService.createLock(invalidRequest)
        assertFalse(invalidResult.success)
        assertEquals("ERG amount must be positive", invalidResult.error)
        
        // Invalid duration
        val invalidDurationRequest = validRequest.copy(durationBlocks = -1)
        val invalidDurationResult = lockService.createLock(invalidDurationRequest)
        assertFalse(invalidDurationResult.success)
        assertEquals("Duration must be positive", invalidDurationResult.error)
    }
    
    @Test
    fun `test USD value calculation`() = runBlocking {
        val ergAmount = 1000000000L // 1 ERG
        val tokens = emptyList<TokenAmount>()
        
        whenever(priceService.calculateUsdValue(ergAmount, emptyList()))
            .thenReturn(2.5) // Mock $2.50 per ERG
        
        val usdValue = lockService.calculateLockValue(ergAmount, tokens)
        assertEquals(2.5, usdValue)
    }
}