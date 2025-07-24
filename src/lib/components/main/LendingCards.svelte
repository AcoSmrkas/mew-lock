<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo } from '$lib/store/store';
	import { LENDING_CONTRACT, EE_API } from '$lib/common/const.ts';
	import { RECOMMENDED_MIN_FEE_VALUE } from '@fleet-sdk/core';
	import { ErgoAddress } from '@fleet-sdk/core';
	import {
		borrowLoanTx,
		repayLoanTx,
		cancelLoanTx,
		liquidateLoanTx,
		checkIsLender,
		checkIsBorrower,
		parseLending,
		getAvailableActions,
		getAvailableActionsWithBox
	} from '$lib/contract/lendingTx.ts';
	import {
		showCustomToast,
		getImageUrl,
		setPlaceholderImage,
		truncateAddress,
		nFormatter
	} from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import Loading from '$lib/components/common/Loading.svelte';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import { get } from 'svelte/store';

	let loans = [];
	let originalBoxes = new Map(); // Store original box data by boxId
	let loadComplete = false;
	let currentHeight = 0;
	let processing = {};
	let showErgopayModal = false;
	let unsignedTx = null;

	onMount(async () => {
		await fetchLoans();
		currentHeight = await getBlockHeight();
		loadComplete = true;
	});

	// Convert public key to Ergo address
	function convertPKToAddress(pkRegister: any): string {
		try {
			const serializedValue =
				pkRegister?.serializedValue || pkRegister?.renderedValue || pkRegister;

			if (!serializedValue) return 'Invalid Address';

			// Remove '07' prefix if present (GroupElement prefix)
			const publicKey = serializedValue.startsWith('07')
				? serializedValue.substring(2)
				: serializedValue;

			// Convert to Ergo address
			return ErgoAddress.fromPublicKey(publicKey).toString();
		} catch (error) {
			console.error('Address conversion error:', error, pkRegister);
			return 'Invalid Address';
		}
	}

	// Parse lending data with improved tuple parsing
	async function parseLendingBox(box: any) {
		try {
			console.log('📋 Parsing NEW SECURE contract lending box:', box.boxId);
			const parsed = await parseLending(box);
			console.log('✅ Successfully parsed NEW SECURE contract lending box:', parsed);
			return parsed;
		} catch (error) {
			console.error('❌ Error parsing NEW SECURE contract lending box:', error);
			// Skip this box entirely - we only want NEW contract boxes
			throw error;
		}
	}

	async function fetchLoans() {
		try {
			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${LENDING_CONTRACT}`
			);
			const data = await response.json();

			// Filter for NEW contract boxes only (must have R4-R9 registers)
			const filteredBoxes = data.items.filter((box) => {
				// NEW contract must have all registers R4-R9
				const hasAllRegisters =
					box.additionalRegisters?.R4 &&
					box.additionalRegisters?.R5 &&
					box.additionalRegisters?.R6 &&
					box.additionalRegisters?.R7 &&
					box.additionalRegisters?.R8 &&
					box.additionalRegisters?.R9;

				if (!hasAllRegisters) {
					console.log('❌ Skipping box (missing registers):', box.boxId);
					return false;
				}

				// Additional check: NEW contract R9 should be Int (state), old contract R9 was GroupElement
				const r9 = box.additionalRegisters.R9;
				const isNewContract =
					r9?.sigmaType === 'SInt' || (r9?.serializedValue && r9.serializedValue.length <= 4); // Int serialized is short

				if (!isNewContract) {
					console.log('❌ Skipping old contract box:', box.boxId);
					return false;
				}

				console.log('✅ Found NEW contract box:', box.boxId);
				return true;
			});

			// Store original boxes for transaction building
			originalBoxes.clear();
			filteredBoxes.forEach((box) => {
				originalBoxes.set(box.boxId, box);
			});

			// Parse and display first 8 loans (filter out any that fail to parse)
			const parsedLoans = [];
			for (const box of filteredBoxes.slice(0, 8)) {
				try {
					const parsed = await parseLendingBox(box);
					parsedLoans.push(parsed);
				} catch (error) {
					console.warn('⚠️ Skipping box that failed to parse:', box.boxId, error.message);
					// Continue processing other boxes
				}
			}
			loans = parsedLoans;
		} catch (error) {
			console.error('Error fetching loans:', error);
			showCustomToast('Failed to fetch loans', 3000, 'danger');
		}
	}

	async function handleLendingAction(loan: any, action: string) {
		console.log('🔥 Button clicked! Action:', action, 'Loan:', loan.boxId);

		// Check wallet connection
		if (
			$selected_wallet_ergo !== 'ergopay' &&
			!window.ergoConnector[$selected_wallet_ergo]?.isConnected
		) {
			console.log('❌ Wallet not connected:', $selected_wallet_ergo);
			showCustomToast('Connect wallet first.', 1500, 'info');
			return;
		}

		if ($selected_wallet_ergo === 'ergopay' && !$connected_wallet_address) {
			console.log('❌ Ergopay not connected');
			showCustomToast('Connect wallet first.', 1500, 'info');
			return;
		}

		if (processing[loan.boxId]) {
			console.log('⚠️ Already processing this loan:', loan.boxId);
			return;
		}

		console.log('✅ Starting action processing:', { action, boxId: loan.boxId });
		processing[loan.boxId] = true;

		try {
			let myAddress, height;

			// Use connected wallet address and current height for all wallets
			myAddress = $connected_wallet_address;
			height = currentHeight;

			// Get the original box data
			const originalBox = originalBoxes.get(loan.boxId);
			if (!originalBox) {
				throw new Error('Loan box not found (may have been spent)');
			}

			// Clone and prepare box with serialized register values
			let box = JSON.parse(JSON.stringify(originalBox));
			for (const [k, v] of Object.entries(box.additionalRegisters)) {
				box.additionalRegisters[k] = v.serializedValue;
			}

			let unsigned;

			console.log('🔄 Processing action:', action);

			switch (action) {
				case 'borrow':
					console.log('📝 Building borrow transaction...');
					// For borrowing, we need collateral UTXOs
					const borrowAmount = BigInt(50000000) + BigInt(RECOMMENDED_MIN_FEE_VALUE); // Base amount
					const userBoxes = await fetchBoxes(myAddress);
					const borrowUtxos = userBoxes.filter((box) => BigInt(box.value) >= borrowAmount);

					// For now, use some UTXOs as collateral (this should be more sophisticated)
					const collateralUtxos = userBoxes.slice(0, 2);

					console.log('🔧 Calling borrowLoanTx with:', {
						box: box.boxId,
						myAddress,
						collateralUtxos: collateralUtxos.length,
						borrowUtxos: borrowUtxos.length
					});
					unsigned = borrowLoanTx(box, myAddress, collateralUtxos, height, borrowUtxos);
					break;

				case 'repay':
					console.log('📝 Building repay transaction...');
					const repayBoxes = await fetchBoxes(myAddress);

					// Get the specific loan token ID from the loan box
					const loanTokenId = loan.loanTokenId; // This should be available from parsed loan data
					console.log('🎯 Looking for loan token ID:', loanTokenId);

					// Get UTXOs that contain the specific loan tokens we need to repay
					const repaymentUtxos = repayBoxes.filter(
						(box) =>
							box.address === myAddress &&
							box.assets &&
							box.assets.some((asset) => asset.tokenId === loanTokenId && BigInt(asset.amount) > 0)
					);

					// Get ERG UTXOs for fees (allow boxes with tokens, just avoid contracts)
					const feeUtxos = repayBoxes
						.filter(
							(box) =>
								BigInt(box.value) >= BigInt(RECOMMENDED_MIN_FEE_VALUE) &&
								box.address === myAddress && // Only user's own P2PK boxes
								box.address !== LENDING_CONTRACT // Avoid lending contract boxes
							// Allow boxes with tokens - we just need ERG for fees
						)
						.slice(0, 3); // Limit to 3 UTXOs to avoid complexity

					console.log('🔧 Repay UTXO selection:', {
						loanTokenId,
						repaymentUtxos: repaymentUtxos.length,
						feeUtxos: feeUtxos.length,
						totalUtxos: repaymentUtxos.length + feeUtxos.length + 1 // +1 for contract box
					});

					if (repaymentUtxos.length === 0) {
						throw new Error(`No UTXOs found with loan token ${loanTokenId}`);
					}

					if (feeUtxos.length === 0) {
						throw new Error('No fee UTXOs found (need boxes with sufficient ERG)');
					}

					// Calculate total loan tokens available for repayment
					const totalLoanTokens = repaymentUtxos.reduce((sum, box) => {
						const tokenAssets = box.assets?.filter((asset) => asset.tokenId === loanTokenId) || [];
						return (
							sum +
							tokenAssets.reduce((assetSum, asset) => assetSum + BigInt(asset.amount), BigInt(0))
						);
					}, BigInt(0));

					console.log('💰 Loan token availability:', {
						required: loan.loanAmount?.toString() || 'unknown',
						available: totalLoanTokens.toString(),
						sufficient: loan.loanAmount ? totalLoanTokens >= BigInt(loan.loanAmount) : 'unknown'
					});

					unsigned = repayLoanTx(box, myAddress, repaymentUtxos, height, feeUtxos);
					break;

				case 'cancel':
					console.log('📝 Building cancel transaction...');
					const cancelAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);
					const cancelBoxes = await fetchBoxes(myAddress);
					const cancelUtxos = cancelBoxes.filter((box) => BigInt(box.value) >= cancelAmount);

					console.log('🔧 Calling cancelLoanTx with:', {
						box: box.boxId,
						myAddress,
						cancelUtxos: cancelUtxos.length
					});
					unsigned = cancelLoanTx(box, myAddress, height, cancelUtxos);
					break;

				case 'liquidate':
					console.log('📝 Building liquidate transaction...');
					const liquidateAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);
					const liquidateBoxes = await fetchBoxes(myAddress);
					const liquidateUtxos = liquidateBoxes.filter(
						(box) => BigInt(box.value) >= liquidateAmount
					);

					console.log('🔧 Calling liquidateLoanTx with:', {
						box: box.boxId,
						myAddress,
						liquidateUtxos: liquidateUtxos.length
					});
					unsigned = liquidateLoanTx(box, myAddress, height, liquidateUtxos);
					break;

				default:
					console.log('❌ Invalid action:', action);
					throw new Error('Invalid action');
			}

			console.log('💰 Transaction built successfully, submitting...', {
				wallet: $selected_wallet_ergo
			});

			if ($selected_wallet_ergo === 'ergopay') {
				console.log('📱 Using Ergopay for transaction');
				unsignedTx = unsigned;
				showErgopayModal = true;
			} else {
				console.log('💻 Using regular wallet for transaction');
				// For regular wallets, use window.ergo directly
				if (!window.ergo) {
					throw new Error('Wallet not connected');
				}

				console.log('✍️ Signing transaction...');
				const signed = await window.ergo.sign_tx(unsigned);

				console.log('📤 Submitting transaction...');
				const transactionId = await window.ergo.submit_tx(signed);

				console.log('✅ Transaction submitted:', transactionId);

				showCustomToast(
					`Transaction submitted successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Refresh loans after successful transaction
				setTimeout(() => fetchLoans(), 3000);
			}
		} catch (error) {
			console.error(`${action} Error:`, error);
			showCustomToast(`${action} failed: ${error.message}`, 3000, 'danger');
		}

		processing[loan.boxId] = false;
	}

	function getStateLabel(state: number): string {
		switch (state) {
			case 1:
				return 'Available';
			case 2:
				return 'Borrowed';
			default:
				return 'Unknown';
		}
	}

	function getStateColor(state: number): string {
		switch (state) {
			case 1:
				return 'text-green-400'; // Available
			case 2:
				return 'text-yellow-400'; // Borrowed
			default:
				return 'text-gray-400';
		}
	}

	function isExpired(loan: any): boolean {
		return currentHeight > loan.creationHeight + loan.duration;
	}

	function getRemainingTime(loan: any): string {
		const remaining = loan.creationHeight + loan.duration - currentHeight;
		if (remaining <= 0) return 'Expired';
		return `${remaining} blocks`;
	}

	// Enhanced role detection with better error handling
	async function checkUserRole(
		loan: any,
		userAddress: string
	): Promise<{ isLender: boolean; isBorrower: boolean }> {
		let isLender = false;
		let isBorrower = false;

		try {
			// Get the original box data for role checking
			const originalBox = originalBoxes.get(loan.boxId);
			if (originalBox) {
				isLender = checkIsLender(originalBox, userAddress);
				// NEW SECURE CONTRACT: Async borrower detection via transaction history
				isBorrower = await checkIsBorrower(originalBox, userAddress);
			} else {
				console.warn('⚠️ Original box not found for role checking:', loan.boxId);
			}
		} catch (error) {
			console.error('Error checking user role:', error);
		}

		return { isLender, isBorrower };
	}

	async function getEnhancedActions(loan: any, userAddress: string, currentHeight: number) {
		// Get the original box data for action checking
		const originalBox = originalBoxes.get(loan.boxId);
		if (originalBox) {
			// Pass both parsed loan data and original box for complete information
			return await getAvailableActionsWithBox(loan, originalBox, userAddress, currentHeight);
		} else {
			console.warn('⚠️ Original box not found for action checking:', loan.boxId);
			return [{ action: 'none', label: 'Box data not available', role: 'error' }];
		}
	}

	// Get button styling based on role and action
	function getButtonClass(role: string, action: string): string {
		const baseClass = 'primary-btn';

		switch (role) {
			case 'lender':
				if (action === 'cancel') return `${baseClass} lender-cancel`;
				if (action === 'liquidate') return `${baseClass} lender-liquidate`;
				break;
			case 'borrower':
				if (action === 'repay') return `${baseClass} borrower-repay`;
				break;
			case 'public':
				if (action === 'borrow') return `${baseClass} public-borrow`;
				break;
		}

		return baseClass;
	}

	// Get status info styling based on role
	function getStatusClass(role: string): string {
		switch (role) {
			case 'lender':
				return 'status-lender';
			case 'borrower':
				return 'status-borrower';
			case 'public':
				return 'status-public';
			default:
				return 'status-default';
		}
	}

	function getCollateralDisplay(loan: any): string {
		if (loan.collateralTokenId) {
			return `${nFormatter(Number(loan.collateralAmount))} Token`;
		} else {
			return `${nFormatter(Number(loan.collateralAmount) / 1e9)} ERG`;
		}
	}

	function getLoanTokensDisplay(tokens: any[]): string {
		if (!tokens || tokens.length === 0) return 'ERG Only';
		if (tokens.length === 1) return tokens[0].name || 'Token';
		return `${tokens.length} Tokens`;
	}
</script>

{#if !loadComplete}
	<Loading />
{:else if loans.length === 0}
	<div class="no-loans">
		<div class="no-loans-icon">🏦</div>
		<div class="no-loans-text">No loans available</div>
		<div class="no-loans-subtext">Be the first to create a loan offer!</div>
	</div>
{:else}
	<div class="lending-grid">
		{#each loans as loan, index}
			{#await checkUserRole(loan, $connected_wallet_address) then { isLender, isBorrower }}
				<div class="simple-card">
					<div class="card-content">
						<div class="card-header-row">
							<div class="card-title">
								{getLoanTokensDisplay(loan.loanTokens)} Loan
							</div>
							<span class="compact-state-badge {getStateColor(loan.state)}">
								{getStateLabel(loan.state)}
							</span>
						</div>

						{#if isLender || isBorrower}
							<div class="role-line">
								{isLender ? '🏦 You are lending' : '💰 You borrowed this'}
							</div>
						{/if}

						{#if loan.parseError}
							<div class="parse-error-line">
								⚠️ Parse error: {loan.parseError}
							</div>
						{/if}

						<div class="loan-details">
							<div class="detail-row">
								<span class="detail-label">Loan:</span>
								<span class="detail-value">{getLoanTokensDisplay(loan.loanTokens)}</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">Collateral:</span>
								<span class="detail-value">{getCollateralDisplay(loan)}</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">Fee:</span>
								<span class="detail-value">{nFormatter(Number(loan.lendingFee) / 1e9)} ERG</span>
							</div>
							<div class="detail-row">
								<span class="detail-label">Duration:</span>
								<span class="detail-value">{loan.duration} blocks</span>
							</div>
						</div>

						<div class="addresses-section">
							<div class="address-row">
								<span class="address-label">Lender:</span>
								<span class="address-value {isLender ? 'your-address' : ''}"
									>{truncateAddress(loan.lenderAddress)}</span
								>
							</div>
							{#if loan.borrowerAddress}
								<div class="address-row">
									<span class="address-label">Borrower:</span>
									<span class="address-value {isBorrower ? 'your-address' : ''}"
										>{truncateAddress(loan.borrowerAddress)}</span
									>
								</div>
							{/if}
						</div>

						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">APR:</span>
								<span class="info-value">{(loan.feePercent / 100).toFixed(1)}%</span>
							</div>
							<div class="info-item">
								<span class="info-label">Status:</span>
								<span class="info-value"
									>{loan.state === 2 && !isExpired(loan)
										? getRemainingTime(loan)
										: getStateLabel(loan.state)}</span
								>
							</div>
						</div>

						<div class="card-footer">
							{#if $connected_wallet_address}
								{#await getEnhancedActions(loan, $connected_wallet_address, currentHeight) then actions}
									{#each actions as actionItem}
										{#if actionItem.action !== 'none'}
											<button
												class="action-btn {getButtonClass(actionItem.role, actionItem.action)}"
												disabled={processing[loan.boxId]}
												on:click={() => handleLendingAction(loan, actionItem.action)}
												title={actionItem.description || ''}
											>
												{processing[loan.boxId] ? 'Processing...' : actionItem.label}
											</button>
										{:else}
											<div class="status-info {getStatusClass(actionItem.role)}">
												<span class="status-label">{actionItem.label}</span>
												{#if actionItem.description}
													<span class="status-description">{actionItem.description}</span>
												{/if}
											</div>
										{/if}
									{/each}
								{:catch}
									<div class="error-prompt">Error loading actions</div>
								{/await}
							{:else}
								<div class="connect-prompt">Connect wallet to interact</div>
							{/if}
						</div>
					</div>
				</div>
			{:catch}
				<div class="simple-card error-card">
					<div class="card-content">
						<div class="error-message">Error loading loan data</div>
					</div>
				</div>
			{/await}
		{/each}
	</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showModal={showErgopayModal} bind:transactionData={unsignedTx} />
{/if}

<style>
	.lending-grid {
		display: grid;
		grid-template-columns: repeat(1, 1fr);
		gap: 20px;
		justify-content: space-between;
		margin-bottom: 34px;
	}

	@media (min-width: 400px) {
		.lending-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 600px) {
		.lending-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 800px) {
		.lending-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (min-width: 1000px) {
		.lending-grid {
			grid-template-columns: repeat(5, 1fr);
		}
	}

	.simple-card {
		background: var(--forms-bg);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 0;
		transition: all 0.3s ease;
		height: 350px;
		display: flex;
		flex-direction: column;
	}

	.simple-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		border-color: var(--main-color);
	}

	.card-content {
		padding: 12px;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	.card-header-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 8px;
		gap: 8px;
	}

	.card-title {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text);
		line-height: 1.2;
		flex: 1;
	}

	.compact-state-badge {
		font-weight: bold;
		text-transform: uppercase;
		font-size: 0.6rem;
		letter-spacing: 0.05em;
		padding: 2px 6px;
		border-radius: 6px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.text-yellow-400 {
		color: var(--main-color);
		background: rgba(255, 193, 7, 0.15);
	}

	.text-green-400 {
		color: #10b981;
		background: rgba(16, 185, 129, 0.15);
	}

	.text-gray-400 {
		color: #9ca3af;
		background: rgba(156, 163, 175, 0.15);
	}

	.role-line {
		font-size: 0.7rem;
		color: var(--main-color);
		font-weight: 500;
		margin-bottom: 6px;
	}

	.parse-error-line {
		font-size: 0.65rem;
		color: #ef4444;
		font-weight: 500;
		margin-bottom: 6px;
		padding: 2px 4px;
		background: rgba(239, 68, 68, 0.1);
		border-radius: 4px;
	}

	.loan-details {
		flex: 1;
		margin-bottom: 8px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.detail-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}

	.detail-value {
		font-size: 0.7rem;
		color: var(--text);
		font-weight: 600;
	}

	.addresses-section {
		margin-bottom: 8px;
		padding: 6px;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 6px;
	}

	.address-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2px;
	}

	.address-label {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.address-value {
		font-size: 0.65rem;
		color: var(--text);
		font-family: monospace;
	}

	.your-address {
		color: var(--main-color);
		font-weight: bold;
	}

	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 12px;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 4px;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 4px;
	}

	.info-label {
		font-size: 0.6rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
		margin-bottom: 2px;
	}

	.info-value {
		font-size: 0.7rem;
		color: var(--text);
		font-weight: 600;
	}

	.card-footer {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.action-btn {
		background: var(--main-color);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 8px 12px;
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		position: relative;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--secondary-color);
		transform: translateY(-1px);
	}

	.action-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Role-based button styling */
	.lender-cancel {
		background: #f59e0b;
		color: white;
	}

	.lender-cancel:hover:not(:disabled) {
		background: #d97706;
	}

	.lender-liquidate {
		background: #ef4444;
		color: white;
	}

	.lender-liquidate:hover:not(:disabled) {
		background: #dc2626;
	}

	.borrower-repay {
		background: #10b981;
		color: white;
	}

	.borrower-repay:hover:not(:disabled) {
		background: #059669;
	}

	.public-borrow {
		background: var(--main-color);
		color: white;
	}

	.public-borrow:hover:not(:disabled) {
		background: var(--secondary-color);
	}

	.info-text {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		padding: 4px;
	}

	/* Status info styling */
	.status-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-radius: 4px;
		text-align: center;
		font-size: 0.65rem;
	}

	.status-label {
		font-weight: 600;
		font-size: 0.7rem;
	}

	.status-description {
		font-size: 0.6rem;
		opacity: 0.8;
		font-weight: 400;
	}

	.status-lender {
		background: rgba(245, 158, 11, 0.15);
		color: #f59e0b;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.status-borrower {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.3);
	}

	.status-public {
		background: rgba(159, 4, 255, 0.15);
		color: var(--main-color);
		border: 1px solid rgba(159, 4, 255, 0.3);
	}

	.status-default {
		background: rgba(156, 163, 175, 0.15);
		color: #9ca3af;
		border: 1px solid rgba(156, 163, 175, 0.3);
	}

	.connect-prompt {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		padding: 8px;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 4px;
	}

	.no-loans {
		text-align: center;
		padding: 40px 20px;
		color: var(--text);
	}

	.no-loans-icon {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.no-loans-text {
		font-size: 1.2rem;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.no-loans-subtext {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.error-card {
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
	}

	.error-message {
		color: #ef4444;
		font-size: 0.8rem;
		text-align: center;
		padding: 20px;
	}

	.error-prompt {
		font-size: 0.65rem;
		color: #ef4444;
		text-align: center;
		padding: 8px;
		background: rgba(239, 68, 68, 0.1);
		border-radius: 4px;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}
</style>
