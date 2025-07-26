package com.mewfinance.mewlock.backend.services

import com.mewfinance.mewlock.common.*
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import org.springframework.stereotype.Service
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI
import java.time.Duration

@Service
class ErgoService {
    private val logger = KotlinLogging.logger {}
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(30))
        .build()
    
    private val explorerUrl = "https://api.ergoplatform.com/api/v1"
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun getCurrentHeight(): Int = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("$explorerUrl/info"))
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val jsonResponse = json.parseToJsonElement(response.body()).jsonObject
            
            jsonResponse["height"]?.jsonPrimitive?.int ?: 0
        } catch (e: Exception) {
            logger.error(e) { "Failed to get current height" }
            0
        }
    }

    suspend fun getMewLockBoxes(): List<MewLockBox> = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("$explorerUrl/boxes/unspent/byAddress/${MewLockConstants.CONTRACT_ADDRESS}?limit=500"))
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val jsonResponse = json.parseToJsonElement(response.body()).jsonObject
            val currentHeight = getCurrentHeight()
            
            val items = jsonResponse["items"]?.jsonArray ?: JsonArray(emptyList())
            
            items.mapNotNull { item ->
                parseBoxToMewLock(item.jsonObject, currentHeight)
            }
        } catch (e: Exception) {
            logger.error(e) { "Failed to fetch MewLock boxes" }
            emptyList()
        }
    }

    suspend fun getUserLocks(address: String): List<MewLockBox> = withContext(Dispatchers.IO) {
        getMewLockBoxes().filter { it.depositorAddress == address }
    }

    suspend fun getGlobalStats(): GlobalStats = withContext(Dispatchers.IO) {
        val locks = getMewLockBoxes()
        val currentHeight = getCurrentHeight()
        
        GlobalStats(
            totalLocks = locks.size,
            totalUsers = locks.map { it.depositorAddress }.distinct().size,
            totalValueLocked = locks.sumOf { it.ergAmount },
            totalUsdValue = locks.sumOf { it.usdValue },
            readyToUnlock = locks.count { it.canWithdraw },
            averageLockDuration = if (locks.isNotEmpty()) {
                locks.map { it.unlockHeight - it.creationHeight }.average().toInt()
            } else 0
        )
    }

    suspend fun getUserStats(address: String): UserStats = withContext(Dispatchers.IO) {
        val userLocks = getUserLocks(address)
        val allLocks = getMewLockBoxes()
        
        // Calculate user ranking by total value locked
        val userValues = allLocks.groupBy { it.depositorAddress }
            .mapValues { (_, locks) -> locks.sumOf { it.usdValue } }
            .toList()
            .sortedByDescending { it.second }
        
        val rank = userValues.indexOfFirst { it.first == address } + 1
        
        UserStats(
            address = address,
            totalLocks = userLocks.size,
            totalValueLocked = userLocks.sumOf { it.ergAmount },
            totalUsdValue = userLocks.sumOf { it.usdValue },
            readyLocks = userLocks.count { it.canWithdraw },
            rank = if (rank > 0) rank else 0
        )
    }

    private fun parseBoxToMewLock(box: JsonObject, currentHeight: Int): MewLockBox? {
        return try {
            val boxId = box["boxId"]?.jsonPrimitive?.content ?: return null
            val value = box["value"]?.jsonPrimitive?.long ?: return null
            val creationHeight = box["creationHeight"]?.jsonPrimitive?.int ?: return null
            
            val registers = box["additionalRegisters"]?.jsonObject ?: return null
            
            // Parse depositor address from R4
            val depositorAddress = parseAddressFromRegister(
                registers["R4"]?.jsonPrimitive?.content
            ) ?: return null
            
            // Parse unlock height from R5
            val unlockHeight = parseUnlockHeight(
                registers["R5"]?.jsonPrimitive?.content
            ) ?: return null
            
            // Parse tokens
            val tokens = parseTokens(box["assets"]?.jsonArray)
            
            val canWithdraw = currentHeight >= unlockHeight
            val remainingBlocks = maxOf(0, unlockHeight - currentHeight)
            
            MewLockBox(
                boxId = boxId,
                ergAmount = value,
                tokens = tokens,
                depositorAddress = depositorAddress,
                unlockHeight = unlockHeight,
                currentHeight = currentHeight,
                creationHeight = creationHeight,
                canWithdraw = canWithdraw,
                remainingBlocks = remainingBlocks
            )
        } catch (e: Exception) {
            logger.error(e) { "Failed to parse box: ${box["boxId"]}" }
            null
        }
    }

    private fun parseAddressFromRegister(registerData: String?): String? {
        // This would need proper implementation for address conversion
        // For now, return a placeholder - you'd need to implement proper
        // GroupElement to Address conversion here
        return registerData?.let { "9..." } // Placeholder
    }

    private fun parseUnlockHeight(registerData: String?): Int? {
        return try {
            // Parse VLQ encoded height from R5
            // This is a simplified version - you'd need proper VLQ decoding
            registerData?.let { 
                // Remove prefix and decode hex to int
                val hex = it.removePrefix("04")
                hex.toIntOrNull(16)
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun parseTokens(assets: JsonArray?): List<TokenAmount> {
        return assets?.mapNotNull { asset ->
            try {
                val tokenObj = asset.jsonObject
                TokenAmount(
                    tokenId = tokenObj["tokenId"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    amount = tokenObj["amount"]?.jsonPrimitive?.long ?: return@mapNotNull null,
                    name = tokenObj["name"]?.jsonPrimitive?.content,
                    decimals = tokenObj["decimals"]?.jsonPrimitive?.int ?: 0
                )
            } catch (e: Exception) {
                null
            }
        } ?: emptyList()
    }

    suspend fun buildLockTransaction(request: CreateLockRequest): TransactionResult = withContext(Dispatchers.IO) {
        // This would contain the actual transaction building logic
        // For now, return a mock result
        try {
            logger.info { "Building lock transaction for ${request.ergAmount} ERG, duration ${request.durationBlocks} blocks" }
            
            // In a real implementation, this would:
            // 1. Create the transaction using Ergo AppKit
            // 2. Build the MewLock box with proper registers
            // 3. Return transaction bytes for signing
            
            TransactionResult(
                success = true,
                txId = "mock_tx_${System.currentTimeMillis()}"
            )
        } catch (e: Exception) {
            logger.error(e) { "Failed to build lock transaction" }
            TransactionResult(
                success = false,
                error = e.message
            )
        }
    }

    suspend fun buildUnlockTransaction(boxId: String, userAddress: String): TransactionResult = withContext(Dispatchers.IO) {
        try {
            logger.info { "Building unlock transaction for box $boxId" }
            
            // In a real implementation, this would:
            // 1. Fetch the MewLock box
            // 2. Calculate fees (3%)
            // 3. Create outputs (user gets 97%, dev gets 3%)
            // 4. Return transaction bytes for signing
            
            TransactionResult(
                success = true,
                txId = "mock_unlock_tx_${System.currentTimeMillis()}"
            )
        } catch (e: Exception) {
            logger.error(e) { "Failed to build unlock transaction" }
            TransactionResult(
                success = false,
                error = e.message
            )
        }
    }
}