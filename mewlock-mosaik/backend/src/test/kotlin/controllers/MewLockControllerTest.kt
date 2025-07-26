package com.mewfinance.mewlock.backend.controllers

import com.mewfinance.mewlock.backend.services.LockService
import com.mewfinance.mewlock.backend.services.PriceService
import com.mewfinance.mewlock.common.*
import org.ergoplatform.mosaik.model.MosaikContext
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.*
import org.springframework.boot.test.context.SpringBootTest
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.whenever

@SpringBootTest
class MewLockControllerTest {
    
    @Mock
    private lateinit var lockService: LockService
    
    @Mock
    private lateinit var priceService: PriceService
    
    @Mock
    private lateinit var mosaikContext: MosaikContext
    
    private lateinit var controller: MewLockController
    
    @BeforeEach
    fun setup() {
        MockitoAnnotations.openMocks(this)
        controller = MewLockController(lockService, priceService)
    }
    
    @Test
    fun `test app creation`() {
        val app = controller.createApp(mosaikContext)
        
        assertNotNull(app)
        assertEquals("MewLock", app.appName)
        assertEquals(1, app.appVersion)
        assertNotNull(app.content)
    }
    
    @Test
    fun `test navigation action`() {
        val app = controller.onBackendRequest(
            "navigate",
            mapOf("view" to "create"),
            mosaikContext
        )
        
        assertNotNull(app)
        assertEquals("MewLock", app?.appName)
    }
    
    @Test
    fun `test wallet connection action`() {
        val app = controller.onBackendRequest(
            "connectWallet",
            emptyMap(),
            mosaikContext
        )
        
        assertNotNull(app)
        assertEquals("MewLock", app?.appName)
    }
    
    @Test
    fun `test ERG amount update action`() {
        val app = controller.onBackendRequest(
            "updateErgAmount",
            mapOf("amount" to "1.5"),
            mosaikContext
        )
        
        assertNotNull(app)
    }
    
    @Test
    fun `test duration selection action`() {
        val app = controller.onBackendRequest(
            "selectDuration",
            mapOf("blocks" to "5040"), // 1 week
            mosaikContext
        )
        
        assertNotNull(app)
    }
    
    @Test
    fun `test unknown action handling`() {
        val app = controller.onBackendRequest(
            "unknown_action",
            emptyMap(),
            mosaikContext
        )
        
        assertNull(app)
    }
    
    @Test
    fun `test create lock action`() {
        whenever(priceService.formatErg(org.mockito.kotlin.any())).thenReturn("1.0000 ERG")
        whenever(priceService.formatUsd(org.mockito.kotlin.any())).thenReturn("$2.50")
        whenever(priceService.calculateUsdValue(org.mockito.kotlin.any())).thenReturn(2.5)
        
        // First connect wallet
        controller.onBackendRequest(
            "connectWallet",
            emptyMap(),
            mosaikContext
        )
        
        // Set form data
        controller.onBackendRequest(
            "updateErgAmount",
            mapOf("amount" to "1.0"),
            mosaikContext
        )
        
        controller.onBackendRequest(
            "selectDuration",
            mapOf("blocks" to "5040"),
            mosaikContext
        )
        
        // Create lock
        val app = controller.onBackendRequest(
            "createLock",
            emptyMap(),
            mosaikContext
        )
        
        assertNotNull(app)
    }
}