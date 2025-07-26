package com.mewfinance.mewlock.common

import kotlinx.serialization.Serializable
import java.math.BigDecimal

/**
 * Core data models for MewLock Mosaik application
 */

@Serializable
data class MewLockBox(
    val boxId: String,
    val ergAmount: Long,
    val tokens: List<TokenAmount>,
    val depositorAddress: String,
    val unlockHeight: Int,
    val currentHeight: Int,
    val creationHeight: Int,
    val canWithdraw: Boolean,
    val remainingBlocks: Int,
    val usdValue: Double = 0.0
) {
    val isExpired: Boolean get() = currentHeight >= unlockHeight
    val blocksUntilUnlock: Int get() = maxOf(0, unlockHeight - currentHeight)
    val daysUntilUnlock: Int get() = (blocksUntilUnlock * 2) / (24 * 60) // ~2 min per block
}

@Serializable
data class TokenAmount(
    val tokenId: String,
    val amount: Long,
    val name: String? = null,
    val decimals: Int = 0
) {
    val displayAmount: Double get() = amount.toDouble() / Math.pow(10.0, decimals.toDouble())
}

@Serializable
data class LockDuration(
    val label: String,
    val blocks: Int,
    val days: Int
) {
    companion object {
        val AVAILABLE_DURATIONS = listOf(
            LockDuration("1 Month", 1296, 30),
            LockDuration("3 Months", 3888, 90),
            LockDuration("6 Months", 7776, 180),
            LockDuration("1 Year", 15552, 365),
            LockDuration("2 Years", 31104, 730),
            LockDuration("3 Years", 46656, 1095),
            LockDuration("4 Years", 62208, 1460),
            LockDuration("5 Years", 77760, 1825),
            LockDuration("10 Years", 155520, 3650)
        )
    }
}

@Serializable
data class WalletState(
    val isConnected: Boolean = false,
    val address: String? = null,
    val balance: Long = 0L,
    val walletType: String? = null
)

@Serializable
data class PriceInfo(
    val ergUsd: Double,
    val tokenPrices: Map<String, Double> = emptyMap(),
    val lastUpdated: Long = System.currentTimeMillis()
)

@Serializable
data class GlobalStats(
    val totalLocks: Int,
    val totalUsers: Int,
    val totalValueLocked: Long,
    val totalUsdValue: Double,
    val readyToUnlock: Int,
    val averageLockDuration: Int
)

@Serializable
data class UserStats(
    val address: String,
    val totalLocks: Int,
    val totalValueLocked: Long,
    val totalUsdValue: Double,
    val readyLocks: Int,
    val rank: Int = 0
)

@Serializable
data class CreateLockRequest(
    val ergAmount: Long,
    val tokens: List<TokenAmount>,
    val durationBlocks: Int,
    val depositorAddress: String
)

@Serializable
data class TransactionResult(
    val success: Boolean,
    val txId: String? = null,
    val error: String? = null
)

// UI State Models
@Serializable
data class AppState(
    val wallet: WalletState = WalletState(),
    val prices: PriceInfo = PriceInfo(0.0),
    val globalStats: GlobalStats = GlobalStats(0, 0, 0L, 0.0, 0, 0),
    val currentView: String = "home"
)

// Constants
object MewLockConstants {
    const val CONTRACT_ADDRESS = "5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAq"
    const val DEV_ADDRESS = "9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY"
    const val WITHDRAWAL_FEE = 0.03 // 3%
    const val MIN_ERG_FOR_FEE = 100000L // 0.1 ERG
    const val MIN_TOKENS_FOR_FEE = 34L
    const val ERGO_DECIMALS = 9
    const val NETWORK_FEE = 1100000L // 0.0011 ERG
}