package com.mewfinance.mewlock.backend.controllers

import com.mewfinance.mewlock.backend.services.LockService
import com.mewfinance.mewlock.backend.services.PriceService
import com.mewfinance.mewlock.common.*
import io.github.oshai.kotlinlogging.KotlinLogging
import org.ergoplatform.mosaik.MosaikApp
import org.ergoplatform.mosaik.MosaikBackend
import org.ergoplatform.mosaik.model.MosaikContext
import org.ergoplatform.mosaik.model.ui.*
import org.ergoplatform.mosaik.model.ui.input.TextField
import org.ergoplatform.mosaik.model.ui.layout.*
import org.springframework.stereotype.Controller

@Controller
class MewLockController(
    private val lockService: LockService,
    private val priceService: PriceService
) : MosaikBackend {
    
    private val logger = KotlinLogging.logger {}
    private var appState = AppState()
    
    data class LockFormState(
        val ergAmount: Double = 0.0,
        val selectedDuration: LockDuration? = null,
        val tokens: List<TokenAmount> = emptyList()
    )
    
    data class AppState(
        val currentView: String = "home",
        val wallet: WalletState = WalletState(),
        val globalStats: GlobalStats = GlobalStats(),
        val userLocks: List<MewLockBox> = emptyList(),
        val lockForm: LockFormState = LockFormState(),
        val isLoading: Boolean = false,
        val error: String? = null
    )

    override fun createApp(context: MosaikContext): MosaikApp {
        return MosaikApp(
            appName = "MewLock",
            appVersion = 1,
            targetCanvasDimension = FitContent(Dimension.FILL_MAX_WIDTH, Dimension.WRAP_CONTENT),
            content = createMainContent(context)
        )
    }

    private fun createMainContent(context: MosaikContext): ViewElement {
        return when (appState.currentView) {
            "home" -> createHomeView(context)
            "create" -> createLockView(context)
            "mylocks" -> createMyLocksView(context)
            "stats" -> createStatsView(context)
            else -> createHomeView(context)
        }
    }

    private fun createHomeView(context: MosaikContext): ViewElement {
        return Column(
            children = listOf(
                createHeader(),
                createNavigation(context),
                createWalletSection(context),
                createStatsCards(),
                createRecentActivity(),
                createFooter()
            ),
            spacing = Padding.DEFAULT
        )
    }

    private fun createHeader(): ViewElement {
        return Row(
            children = listOf(
                Text(
                    text = "🔒 MewLock",
                    style = TextStyle.HEADLINE1
                ),
                HorizontalRule(),
                Text(
                    text = "Time-Locked Asset Storage",
                    style = TextStyle.BODY1SECONDARY
                )
            ),
            packed = HorizontalAlignment.CENTER
        )
    }

    private fun createNavigation(context: MosaikContext): ViewElement {
        return Row(
            children = listOf(
                createNavButton("Home", "home", context),
                createNavButton("Create Lock", "create", context),
                createNavButton("My Locks", "mylocks", context),
                createNavButton("Statistics", "stats", context)
            ),
            spacing = Padding.HALF_DEFAULT
        )
    }

    private fun createNavButton(title: String, view: String, context: MosaikContext): ViewElement {
        val isActive = appState.currentView == view
        
        return Button(
            text = title,
            onClick = Action.BackendRequest(
                "navigate",
                mapOf("view" to view)
            ),
            style = if (isActive) ButtonStyle.PRIMARY else ButtonStyle.SECONDARY
        )
    }

    private fun createWalletSection(context: MosaikContext): ViewElement {
        return if (appState.wallet.isConnected) {
            createConnectedWalletCard()
        } else {
            createConnectWalletCard(context)
        }
    }

    private fun createConnectedWalletCard(): ViewElement {
        return Card(
            content = Column(
                children = listOf(
                    Text("💰 Wallet Connected", style = TextStyle.HEADLINE2),
                    Text("Address: ${appState.wallet.address?.take(10)}..."),
                    Text("Balance: ${priceService.formatErg(appState.wallet.balance)}"),
                    Text("USD Value: ${priceService.formatUsd(
                        priceService.calculateUsdValue(appState.wallet.balance)
                    )}")
                )
            )
        )
    }

    private fun createConnectWalletCard(context: MosaikContext): ViewElement {
        return Card(
            content = Column(
                children = listOf(
                    Text("🔗 Connect Wallet", style = TextStyle.HEADLINE2),
                    Text("Connect your Ergo wallet to start using MewLock"),
                    Button(
                        text = "Connect Wallet",
                        onClick = Action.BackendRequest("connectWallet", emptyMap()),
                        style = ButtonStyle.PRIMARY
                    )
                )
            )
        )
    }

    private fun createStatsCards(): ViewElement {
        return Row(
            children = listOf(
                createStatCard("Total Locks", appState.globalStats.totalLocks.toString()),
                createStatCard("Total Users", appState.globalStats.totalUsers.toString()),
                createStatCard("Value Locked", priceService.formatErg(appState.globalStats.totalValueLocked)),
                createStatCard("USD Value", priceService.formatUsd(appState.globalStats.totalUsdValue))
            )
        )
    }

    private fun createStatCard(title: String, value: String): ViewElement {
        return Card(
            content = Column(
                children = listOf(
                    Text(title, style = TextStyle.BODY1SECONDARY),
                    Text(value, style = TextStyle.HEADLINE2)
                ),
                spacing = Padding.QUARTER_DEFAULT
            )
        )
    }

    private fun createRecentActivity(): ViewElement {
        return Card(
            content = Column(
                children = listOf(
                    Text("📊 Recent Activity", style = TextStyle.HEADLINE2),
                    Text("Loading recent locks...", style = TextStyle.BODY1SECONDARY)
                    // TODO: Add actual recent activity list
                )
            )
        )
    }

    private fun createLockView(context: MosaikContext): ViewElement {
        return Column(
            children = listOf(
                createHeader(),
                createNavigation(context),
                createLockForm(context),
                createFooter()
            ),
            spacing = Padding.DEFAULT
        )
    }

    private fun createLockForm(context: MosaikContext): ViewElement {
        val form = appState.lockForm
        val isValidAmount = form.ergAmount >= 0.1
        val hasSelectedDuration = form.selectedDuration != null
        val canCreate = isValidAmount && hasSelectedDuration && appState.wallet.isConnected
        
        return Card(
            content = Column(
                children = listOfNotNull(
                    Text("🔒 Create New Lock", style = TextStyle.HEADLINE2),
                    
                    // Wallet balance display
                    if (appState.wallet.isConnected) {
                        createWalletBalanceInfo()
                    } else null,
                    
                    // ERG Amount input
                    Column(
                        children = listOf(
                            Text("ERG Amount:", style = TextStyle.BODY1),
                            TextField(
                                value = if (form.ergAmount > 0) form.ergAmount.toString() else "",
                                placeholder = "Enter ERG amount (min 0.1)",
                                onValueChanged = Action.BackendRequest(
                                    "updateErgAmount",
                                    mapOf("amount" to "${form.ergAmount}")
                                )
                            ),
                            if (!isValidAmount && form.ergAmount > 0) {
                                Text("⚠️ Minimum amount is 0.1 ERG", style = TextStyle.BODY1SECONDARY)
                            } else if (form.ergAmount > 0) {
                                Text(
                                    text = "💵 ≈ ${priceService.formatUsd(
                                        priceService.calculateUsdValue(
                                            (form.ergAmount * 1e9).toLong()
                                        )
                                    )}",
                                    style = TextStyle.BODY1SECONDARY
                                )
                            } else {
                                Text("Enter amount to see USD value", style = TextStyle.BODY1SECONDARY)
                            }
                        ),
                        spacing = Padding.QUARTER_DEFAULT
                    ),
                    
                    HorizontalRule(),
                    
                    // Duration selector
                    Text("Lock Duration:", style = TextStyle.BODY1),
                    Column(
                        children = LockDuration.AVAILABLE_DURATIONS.map { duration ->
                            val isSelected = form.selectedDuration?.blocks == duration.blocks
                            Button(
                                text = if (isSelected) {
                                    "✓ ${duration.label} (${duration.days} days)"
                                } else {
                                    "${duration.label} (${duration.days} days)"
                                },
                                onClick = Action.BackendRequest(
                                    "selectDuration",
                                    mapOf("blocks" to duration.blocks.toString())
                                ),
                                style = if (isSelected) ButtonStyle.PRIMARY else ButtonStyle.SECONDARY
                            )
                        },
                        spacing = Padding.QUARTER_DEFAULT
                    ),
                    
                    // Storage rent warning
                    if (form.selectedDuration != null && lockService.isStorageRentRequired(form.selectedDuration.blocks)) {
                        Card(
                            content = Column(
                                children = listOf(
                                    Text("⚠️ Storage Rent Notice", style = TextStyle.HEADLINE3),
                                    Text("Locks longer than 4 years require storage rent payments."),
                                    Text("Learn more: https://ergoplatform.org/en/blog/2022-02-18-ergo-explainer-storage-rent/")
                                ),
                                spacing = Padding.QUARTER_DEFAULT
                            )
                        )
                    } else null,
                    
                    HorizontalRule(),
                    
                    // Fee information
                    createDetailedFeeInfo(form),
                    
                    // Create button with validation
                    Button(
                        text = if (!appState.wallet.isConnected) {
                            "Connect Wallet First"
                        } else if (!isValidAmount) {
                            "Enter Valid Amount"
                        } else if (!hasSelectedDuration) {
                            "Select Duration"
                        } else {
                            "🔒 Create Lock"
                        },
                        onClick = if (canCreate) {
                            Action.BackendRequest("createLock", emptyMap())
                        } else {
                            Action.BackendRequest("connectWallet", emptyMap())
                        },
                        style = if (canCreate) ButtonStyle.PRIMARY else ButtonStyle.SECONDARY
                    )
                ),
                spacing = Padding.DEFAULT
            )
        )
    }
    
    private fun createWalletBalanceInfo(): ViewElement {
        return Card(
            content = Row(
                children = listOf(
                    Text("💰 Balance:", style = TextStyle.BODY1SECONDARY),
                    Column(
                        children = listOf(
                            Text(priceService.formatErg(appState.wallet.balance), style = TextStyle.BODY1),
                            Text(priceService.formatUsd(
                                priceService.calculateUsdValue(appState.wallet.balance)
                            ), style = TextStyle.BODY1SECONDARY)
                        )
                    )
                ),
                packed = HorizontalAlignment.SPACE_BETWEEN
            )
        )
    }
    
    private fun createDetailedFeeInfo(form: LockFormState): ViewElement {
        return Column(
            children = listOfNotNull(
                Text("💰 Fee Information", style = TextStyle.HEADLINE3),
                Text("• 3% withdrawal fee applies to all locks", style = TextStyle.BODY1),
                Text("• Network fee: ~0.0011 ERG per transaction", style = TextStyle.BODY1),
                Text("• Minimum amounts: 0.1 ERG, 34 tokens", style = TextStyle.BODY1),
                
                if (form.ergAmount > 0) {
                    Column(
                        children = listOf(
                            HorizontalRule(),
                            Text("Estimated Fees:", style = TextStyle.BODY1SECONDARY),
                            Row(
                                children = listOf(
                                    Text("Withdrawal Fee (3%):"),
                                    Text(priceService.formatErg(
                                        ((form.ergAmount * 1e9) * 0.03).toLong()
                                    ))
                                ),
                                packed = HorizontalAlignment.SPACE_BETWEEN
                            ),
                            Row(
                                children = listOf(
                                    Text("You'll receive:"),
                                    Text(priceService.formatErg(
                                        ((form.ergAmount * 1e9) * 0.97).toLong()
                                    ))
                                ),
                                packed = HorizontalAlignment.SPACE_BETWEEN
                            )
                        ),
                        spacing = Padding.QUARTER_DEFAULT
                    )
                } else null
            ),
            spacing = Padding.QUARTER_DEFAULT
        )
    }

    private fun createFeeInfo(): ViewElement {
        return Column(
            children = listOf(
                Text("💰 Fee Information", style = TextStyle.HEADLINE3),
                Text("• 3% withdrawal fee applies to all locks"),
                Text("• Network fee: ~0.0011 ERG per transaction"),
                Text("• Storage rent applies to locks > 4 years"),
                Text("• Minimum amounts: 0.1 ERG, 34 tokens")
            ),
            spacing = Padding.QUARTER_DEFAULT
        )
    }

    private fun createMyLocksView(context: MosaikContext): ViewElement {
        return Column(
            children = listOf(
                createHeader(),
                createNavigation(context),
                createMyLocksContent(context),
                createFooter()
            ),
            spacing = Padding.DEFAULT
        )
    }

    private fun createMyLocksContent(context: MosaikContext): ViewElement {
        return if (appState.wallet.isConnected) {
            Column(
                children = listOfNotNull(
                    createMyLocksHeader(),
                    createRefreshButton(context),
                    if (appState.isLoading) {
                        Text("Loading your locks...", style = TextStyle.BODY1SECONDARY)
                    } else if (appState.userLocks.isEmpty()) {
                        createNoLocksCard()
                    } else {
                        createUserLocksGrid(context)
                    }
                ),
                spacing = Padding.DEFAULT
            )
        } else {
            createConnectWalletCard(context)
        }
    }
    
    private fun createMyLocksHeader(): ViewElement {
        return Row(
            children = listOf(
                Text("🔐 My Locks", style = TextStyle.HEADLINE2),
                if (appState.userLocks.isNotEmpty()) {
                    Text("(${appState.userLocks.size} locks)", style = TextStyle.BODY1SECONDARY)
                } else {
                    Text("(0 locks)", style = TextStyle.BODY1SECONDARY)
                }
            ),
            spacing = Padding.QUARTER_DEFAULT
        )
    }
    
    private fun createRefreshButton(context: MosaikContext): ViewElement {
        return Button(
            text = "🔄 Refresh",
            onClick = Action.BackendRequest("refreshData", emptyMap()),
            style = ButtonStyle.SECONDARY
        )
    }
    
    private fun createNoLocksCard(): ViewElement {
        return Card(
            content = Column(
                children = listOf(
                    Text("📭 No Locks Found", style = TextStyle.HEADLINE3),
                    Text("You haven't created any locks yet."),
                    Text("Create your first lock to secure your assets over time!"),
                    Button(
                        text = "Create Lock",
                        onClick = Action.BackendRequest("navigate", mapOf("view" to "create")),
                        style = ButtonStyle.PRIMARY
                    )
                ),
                spacing = Padding.DEFAULT
            )
        )
    }
    
    private fun createUserLocksGrid(context: MosaikContext): ViewElement {
        val readyLocks = appState.userLocks.filter { it.canWithdraw }
        val activeLocks = appState.userLocks.filter { !it.canWithdraw }
        
        return Column(
            children = listOfNotNull(
                if (readyLocks.isNotEmpty()) {
                    Column(
                        children = listOf(
                            Text("✅ Ready to Unlock (${readyLocks.size})", style = TextStyle.HEADLINE3),
                            Column(
                                children = readyLocks.map { lock ->
                                    createLockCard(lock, canUnlock = true, context = context)
                                },
                                spacing = Padding.HALF_DEFAULT
                            )
                        ),
                        spacing = Padding.DEFAULT
                    )
                } else null,
                
                if (activeLocks.isNotEmpty()) {
                    Column(
                        children = listOf(
                            Text("⏰ Active Locks (${activeLocks.size})", style = TextStyle.HEADLINE3),
                            Column(
                                children = activeLocks.map { lock ->
                                    createLockCard(lock, canUnlock = false, context = context)
                                },
                                spacing = Padding.HALF_DEFAULT
                            )
                        ),
                        spacing = Padding.DEFAULT
                    )
                } else null
            ),
            spacing = Padding.DEFAULT
        )
    }
    
    private fun createLockCard(lock: MewLockBox, canUnlock: Boolean, context: MosaikContext): ViewElement {
        return Card(
            content = Column(
                children = listOfNotNull(
                    // Header with status
                    Row(
                        children = listOf(
                            Text(
                                text = if (canUnlock) "🟢 Ready" else "🔒 Locked",
                                style = if (canUnlock) TextStyle.HEADLINE3 else TextStyle.BODY1
                            ),
                            Text(
                                text = "Box: ${lock.boxId.take(8)}...",
                                style = TextStyle.BODY1SECONDARY
                            )
                        ),
                        packed = HorizontalAlignment.SPACE_BETWEEN
                    ),
                    
                    // Amount and value
                    Row(
                        children = listOf(
                            Column(
                                children = listOf(
                                    Text("ERG Amount:", style = TextStyle.BODY1SECONDARY),
                                    Text(priceService.formatErg(lock.ergAmount), style = TextStyle.BODY1)
                                )
                            ),
                            Column(
                                children = listOf(
                                    Text("USD Value:", style = TextStyle.BODY1SECONDARY),
                                    Text(priceService.formatUsd(lock.usdValue), style = TextStyle.BODY1)
                                )
                            )
                        ),
                        packed = HorizontalAlignment.SPACE_BETWEEN
                    ),
                    
                    // Time info
                    if (canUnlock) {
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
                    },
                    
                    // Tokens if any
                    if (lock.tokens.isNotEmpty()) {
                        Column(
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
                    } else null,
                    
                    // Unlock button
                    if (canUnlock) {
                        Button(
                            text = "🔓 Unlock Assets",
                            onClick = Action.BackendRequest(
                                "unlockBox",
                                mapOf("boxId" to lock.boxId)
                            ),
                            style = ButtonStyle.PRIMARY
                        )
                    } else null
                ),
                spacing = Padding.HALF_DEFAULT
            )
        )
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
    
    private fun formatTokenAmount(amount: Long, decimals: Int): String {
        val tokenAmount = amount.toDouble() / Math.pow(10.0, decimals.toDouble())
        return when {
            tokenAmount >= 1_000_000 -> "%.2fM".format(tokenAmount / 1_000_000)
            tokenAmount >= 1_000 -> "%.1fK".format(tokenAmount / 1_000)
            else -> "%.${minOf(decimals, 4)}f".format(tokenAmount)
        }
    }

    private fun createStatsView(context: MosaikContext): ViewElement {
        return Column(
            children = listOf(
                createHeader(),
                createNavigation(context),
                createStatsContent(),
                createFooter()
            ),
            spacing = Padding.DEFAULT
        )
    }

    private fun createStatsContent(): ViewElement {
        return Column(
            children = listOf(
                Text("📊 Global Statistics", style = TextStyle.HEADLINE2),
                createStatsCards(),
                Card(
                    content = Column(
                        children = listOf(
                            Text("🏆 Top Lockers", style = TextStyle.HEADLINE3),
                            Text("Loading leaderboard...", style = TextStyle.BODY1SECONDARY)
                            // TODO: Add actual leaderboard
                        )
                    )
                )
            ),
            spacing = Padding.DEFAULT
        )
    }

    private fun createFooter(): ViewElement {
        return Column(
            children = listOf(
                HorizontalRule(),
                Text(
                    text = "Built with ❤️ on Ergo Platform",
                    style = TextStyle.BODY1SECONDARY
                ),
                Text(
                    text = "MewLock v1.0.0",
                    style = TextStyle.BODY1SECONDARY
                )
            ),
            spacing = Padding.QUARTER_DEFAULT
        )
    }

    override fun onBackendRequest(
        actionId: String,
        parameters: Map<String, String>,
        context: MosaikContext
    ): MosaikApp? {
        logger.info { "Backend request: $actionId with parameters: $parameters" }
        
        return when (actionId) {
            "navigate" -> {
                val view = parameters["view"] ?: "home"
                appState = appState.copy(currentView = view)
                createApp(context)
            }
            
            "connectWallet" -> {
                handleWalletConnection(context)
            }
            
            "updateErgAmount" -> {
                val amount = parameters["amount"]?.toDoubleOrNull() ?: 0.0
                appState = appState.copy(
                    lockForm = appState.lockForm.copy(ergAmount = amount)
                )
                createApp(context)
            }
            
            "selectDuration" -> {
                val blocks = parameters["blocks"]?.toIntOrNull() ?: 0
                val duration = LockDuration.AVAILABLE_DURATIONS.find { it.blocks == blocks }
                if (duration != null) {
                    appState = appState.copy(
                        lockForm = appState.lockForm.copy(selectedDuration = duration)
                    )
                }
                createApp(context)
            }
            
            "createLock" -> {
                handleCreateLock(context)
            }
            
            "unlockBox" -> {
                val boxId = parameters["boxId"] ?: return null
                handleUnlockBox(boxId, context)
            }
            
            "refreshData" -> {
                // Force refresh of locks and stats
                handleRefreshData(context)
            }
            
            else -> {
                logger.warn { "Unknown action: $actionId" }
                null
            }
        }
    }
    
    private fun handleWalletConnection(context: MosaikContext): MosaikApp {
        // In a real implementation, this would:
        // 1. Use Mosaik wallet connection API
        // 2. Get actual wallet address and balance
        // 3. Handle different wallet types (Nautilus, Minotaur, etc.)
        
        val mockAddress = "9fCMmB72WcFLseNx6QANheTCrDjKebEiEtVVcZjcg8kFWuSUdp9"
        val mockBalance = 2500000000L // 2.5 ERG
        
        appState = appState.copy(
            wallet = WalletState(
                isConnected = true,
                address = mockAddress,
                balance = mockBalance,
                walletType = "Nautilus"
            )
        )
        
        logger.info { "Wallet connected: $mockAddress" }
        return createApp(context)
    }
    
    private fun handleCreateLock(context: MosaikContext): MosaikApp? {
        if (!appState.wallet.isConnected) {
            logger.warn { "Attempted to create lock without wallet connection" }
            return null
        }
        
        val form = appState.lockForm
        if (form.ergAmount <= 0 || form.selectedDuration == null) {
            logger.warn { "Invalid lock form data" }
            return null
        }
        
        val request = CreateLockRequest(
            depositorAddress = appState.wallet.address ?: return null,
            ergAmount = (form.ergAmount * 1e9).toLong(), // Convert to nanoERG
            tokens = emptyList(), // Could be extended to support tokens
            durationBlocks = form.selectedDuration.blocks
        )
        
        // In a real implementation, this would:
        // 1. Build the transaction using ErgoService
        // 2. Request wallet signature
        // 3. Submit to network
        // 4. Show transaction status
        
        logger.info { "Creating lock: ${form.ergAmount} ERG for ${form.selectedDuration.label}" }
        
        // Reset form and navigate to my locks
        appState = appState.copy(
            lockForm = LockFormState(),
            currentView = "mylocks"
        )
        
        return createApp(context)
    }
    
    private fun handleUnlockBox(boxId: String, context: MosaikContext): MosaikApp? {
        if (!appState.wallet.isConnected) {
            logger.warn { "Attempted to unlock box without wallet connection" }
            return null
        }
        
        val userAddress = appState.wallet.address ?: return null
        
        // In a real implementation, this would:
        // 1. Build unlock transaction with 3% fee
        // 2. Request wallet signature
        // 3. Submit to network
        // 4. Update UI with transaction status
        
        logger.info { "Unlocking box $boxId for $userAddress" }
        
        return createApp(context)
    }
    
    private fun handleRefreshData(context: MosaikContext): MosaikApp {
        // In a real implementation, this would:
        // 1. Clear caches
        // 2. Fetch fresh data from blockchain
        // 3. Update global stats
        
        logger.info { "Refreshing data..." }
        return createApp(context)
    }
}