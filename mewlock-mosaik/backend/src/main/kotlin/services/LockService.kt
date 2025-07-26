package com.mewfinance.mewlock.backend.services

import com.mewfinance.mewlock.common.*
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.springframework.stereotype.Service

@Service
class LockService(
    private val ergoService: ErgoService,
    private val priceService: PriceService
) {
    private val logger = KotlinLogging.logger {}

    suspend fun getAllLocks(): List<MewLockBox> = withContext(Dispatchers.IO) {
        val locks = ergoService.getMewLockBoxes()
        val prices = priceService.getCurrentPrices()
        
        // Add USD values to locks
        locks.map { lock ->
            val tokenPrices = lock.tokens.map { token ->
                token.tokenId to priceService.getTokenPrice(token.tokenId)
            }
            
            val usdValue = priceService.calculateUsdValue(
                lock.ergAmount,
                lock.tokens.map { it.tokenId to it.amount }
            )
            
            lock.copy(usdValue = usdValue)
        }
    }

    suspend fun getUserLocks(address: String): List<MewLockBox> = withContext(Dispatchers.IO) {
        getAllLocks().filter { it.depositorAddress == address }
    }

    suspend fun getReadyLocks(address: String): List<MewLockBox> = withContext(Dispatchers.IO) {
        getUserLocks(address).filter { it.canWithdraw }
    }

    suspend fun getGlobalStats(): GlobalStats = withContext(Dispatchers.IO) {
        ergoService.getGlobalStats()
    }

    suspend fun getUserStats(address: String): UserStats = withContext(Dispatchers.IO) {
        ergoService.getUserStats(address)
    }

    suspend fun getLeaderboard(limit: Int = 20): List<UserStats> = withContext(Dispatchers.IO) {
        val allLocks = getAllLocks()
        
        // Group by user and calculate stats
        val userStats = allLocks.groupBy { it.depositorAddress }
            .map { (address, locks) ->
                UserStats(
                    address = address,
                    totalLocks = locks.size,
                    totalValueLocked = locks.sumOf { it.ergAmount },
                    totalUsdValue = locks.sumOf { it.usdValue },
                    readyLocks = locks.count { it.canWithdraw }
                )
            }
            .sortedByDescending { it.totalUsdValue }
            .take(limit)
        
        // Add rankings
        userStats.mapIndexed { index, stats ->
            stats.copy(rank = index + 1)
        }
    }

    suspend fun createLock(request: CreateLockRequest): TransactionResult = withContext(Dispatchers.IO) {
        try {
            logger.info { "Creating lock for ${request.depositorAddress}: ${request.ergAmount} ERG for ${request.durationBlocks} blocks" }
            
            // Validate request
            if (request.ergAmount <= 0) {
                return@withContext TransactionResult(
                    success = false,
                    error = "ERG amount must be positive"
                )
            }
            
            if (request.durationBlocks <= 0) {
                return@withContext TransactionResult(
                    success = false,
                    error = "Duration must be positive"
                )
            }
            
            // Build transaction
            ergoService.buildLockTransaction(request)
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to create lock" }
            TransactionResult(
                success = false,
                error = e.message ?: "Unknown error"
            )
        }
    }

    suspend fun unlockBox(boxId: String, userAddress: String): TransactionResult = withContext(Dispatchers.IO) {
        try {
            val locks = getUserLocks(userAddress)
            val targetLock = locks.find { it.boxId == boxId }
            
            if (targetLock == null) {
                return@withContext TransactionResult(
                    success = false,
                    error = "Lock not found or not owned by user"
                )
            }
            
            if (!targetLock.canWithdraw) {
                return@withContext TransactionResult(
                    success = false,
                    error = "Lock is not yet ready for withdrawal"
                )
            }
            
            logger.info { "Unlocking box $boxId for $userAddress" }
            
            ergoService.buildUnlockTransaction(boxId, userAddress)
            
        } catch (e: Exception) {
            logger.error(e) { "Failed to unlock box $boxId" }
            TransactionResult(
                success = false,
                error = e.message ?: "Unknown error"
            )
        }
    }

    suspend fun calculateLockValue(ergAmount: Long, tokens: List<TokenAmount>): Double = withContext(Dispatchers.IO) {
        priceService.calculateUsdValue(
            ergAmount,
            tokens.map { it.tokenId to it.amount }
        )
    }

    suspend fun calculateFees(ergAmount: Long, tokens: List<TokenAmount>): Pair<Long, List<TokenAmount>> = withContext(Dispatchers.IO) {
        // Calculate ERG fee (3%)
        val ergFee = if (ergAmount > MewLockConstants.MIN_ERG_FOR_FEE) {
            val fee = (ergAmount * MewLockConstants.WITHDRAWAL_FEE).toLong()
            val maxFee = ergAmount / 10 // Cap at 10%
            minOf(fee, maxFee)
        } else {
            0L
        }
        
        // Calculate token fees (3%)
        val tokenFees = tokens.mapNotNull { token ->
            if (token.amount > MewLockConstants.MIN_TOKENS_FOR_FEE) {
                val fee = (token.amount * MewLockConstants.WITHDRAWAL_FEE).toLong()
                val maxFee = token.amount / 10 // Cap at 10%
                val calculatedFee = minOf(fee, maxFee)
                
                if (calculatedFee > 0) {
                    token.copy(amount = calculatedFee)
                } else null
            } else null
        }
        
        Pair(ergFee, tokenFees)
    }

    fun formatTimeRemaining(remainingBlocks: Int): String {
        val minutes = remainingBlocks * 2 // ~2 minutes per block
        val days = minutes / (24 * 60)
        val hours = (minutes % (24 * 60)) / 60
        val mins = minutes % 60
        
        return when {
            days > 0 -> "${days}d ${hours}h"
            hours > 0 -> "${hours}h ${mins}m"
            else -> "${mins}m"
        }
    }

    fun isStorageRentRequired(durationBlocks: Int): Boolean {
        // Storage rent applies for locks > 4 years
        val fourYearsInBlocks = 4 * 365 * 24 * 30 // ~4 years in blocks
        return durationBlocks > fourYearsInBlocks
    }
}