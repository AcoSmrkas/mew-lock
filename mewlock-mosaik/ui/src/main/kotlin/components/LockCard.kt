package com.mewfinance.mewlock.ui.components

import com.mewfinance.mewlock.common.MewLockBox
import org.ergoplatform.mosaik.model.ui.*
import org.ergoplatform.mosaik.model.ui.layout.*

object LockCard {
    
    fun create(lock: MewLockBox, onUnlock: ((String) -> Action)? = null): ViewElement {
        return Card(
            content = Column(
                children = listOfNotNull(
                    createLockHeader(lock),
                    createLockDetails(lock),
                    createTimeInfo(lock),
                    if (lock.tokens.isNotEmpty()) createTokensList(lock) else null,
                    createValueInfo(lock),
                    if (lock.canWithdraw && onUnlock != null) {
                        createUnlockButton(lock.boxId, onUnlock)
                    } else null
                ),
                spacing = Padding.HALF_DEFAULT
            )
        )
    }
    
    private fun createLockHeader(lock: MewLockBox): ViewElement {
        val statusIcon = if (lock.canWithdraw) "🟢" else "🔒"
        val statusText = if (lock.canWithdraw) "Ready to Unlock" else "Locked"
        
        return Row(
            children = listOf(
                Text(
                    text = "$statusIcon $statusText",
                    style = if (lock.canWithdraw) TextStyle.HEADLINE3 else TextStyle.BODY1
                ),
                Text(
                    text = "Box: ${lock.boxId.take(8)}...",
                    style = TextStyle.BODY1SECONDARY
                )
            ),
            packed = HorizontalAlignment.SPACE_BETWEEN
        )
    }
    
    private fun createLockDetails(lock: MewLockBox): ViewElement {
        return Row(
            children = listOf(
                Column(
                    children = listOf(
                        Text("ERG Amount:", style = TextStyle.BODY1SECONDARY),
                        Text(formatErgAmount(lock.ergAmount), style = TextStyle.BODY1)
                    )
                ),
                Column(
                    children = listOf(
                        Text("USD Value:", style = TextStyle.BODY1SECONDARY),
                        Text(formatUsdValue(lock.usdValue), style = TextStyle.BODY1)
                    )
                )
            ),
            packed = HorizontalAlignment.SPACE_BETWEEN
        )
    }
    
    private fun createTimeInfo(lock: MewLockBox): ViewElement {
        return if (lock.canWithdraw) {
            Text(
                text = "✅ Unlocked at height ${lock.unlockHeight}",
                style = TextStyle.BODY1SECONDARY
            )
        } else {
            Column(
                children = listOf(
                    Text(
                        text = "⏰ Unlocks in ${formatTimeRemaining(lock.remainingBlocks)}",
                        style = TextStyle.BODY1
                    ),
                    Text(
                        text = "At height ${lock.unlockHeight} (${lock.remainingBlocks} blocks)",
                        style = TextStyle.BODY1SECONDARY
                    )
                )
            )
        }
    }
    
    private fun createTokensList(lock: MewLockBox): ViewElement {
        return Column(
            children = listOf(
                Text("🪙 Tokens:", style = TextStyle.BODY1SECONDARY),
                Column(
                    children = lock.tokens.map { token ->
                        Row(
                            children = listOf(
                                Text(
                                    text = token.name ?: "Unknown Token",
                                    style = TextStyle.BODY1
                                ),
                                Text(
                                    text = formatTokenAmount(token.amount, token.decimals),
                                    style = TextStyle.BODY1
                                )
                            ),
                            packed = HorizontalAlignment.SPACE_BETWEEN
                        )
                    },
                    spacing = Padding.QUARTER_DEFAULT
                )
            ),
            spacing = Padding.QUARTER_DEFAULT
        )
    }
    
    private fun createValueInfo(lock: MewLockBox): ViewElement {
        return Row(
            children = listOf(
                Text("💰 Total Value:", style = TextStyle.BODY1SECONDARY),
                Column(
                    children = listOf(
                        Text(formatErgAmount(lock.ergAmount), style = TextStyle.BODY1),
                        Text(formatUsdValue(lock.usdValue), style = TextStyle.BODY1)
                    )
                )
            ),
            packed = HorizontalAlignment.SPACE_BETWEEN
        )
    }
    
    private fun createUnlockButton(boxId: String, onUnlock: (String) -> Action): ViewElement {
        return Button(
            text = "🔓 Unlock Assets",
            onClick = onUnlock(boxId),
            style = ButtonStyle.PRIMARY
        )
    }
    
    private fun formatErgAmount(amount: Long): String {
        val erg = amount.toDouble() / 1e9
        return when {
            erg >= 1_000_000 -> "%.2fM ERG".format(erg / 1_000_000)
            erg >= 1_000 -> "%.1fK ERG".format(erg / 1_000)
            else -> "%.4f ERG".format(erg)
        }
    }
    
    private fun formatUsdValue(value: Double): String {
        return when {
            value >= 1_000_000 -> "$%.2fM".format(value / 1_000_000)
            value >= 1_000 -> "$%.1fK".format(value / 1_000)
            else -> "$%.2f".format(value)
        }
    }
    
    private fun formatTokenAmount(amount: Long, decimals: Int): String {
        val tokenAmount = amount.toDouble() / Math.pow(10.0, decimals.toDouble())
        return when {
            tokenAmount >= 1_000_000 -> "%.2fM".format(tokenAmount / 1_000_000)
            tokenAmount >= 1_000 -> "%.1fK".format(tokenAmount / 1_000)
            else -> "%.${minOf(decimals, 4)}f".format(tokenAmount)
        }
    }
    
    private fun formatTimeRemaining(blocks: Int): String {
        val minutes = blocks * 2 // ~2 minutes per block
        val days = minutes / (24 * 60)
        val hours = (minutes % (24 * 60)) / 60
        val mins = minutes % 60
        
        return when {
            days > 0 -> "${days}d ${hours}h"
            hours > 0 -> "${hours}h ${mins}m"
            else -> "${mins}m"
        }
    }
}