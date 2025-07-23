<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo, assetsInfos } from '$lib/store/store';
	import { LENDING_CONTRACT, LENDING_MIN_FEE_PERCENT } from '$lib/common/const.ts';
	import { RECOMMENDED_MIN_FEE_VALUE } from '@fleet-sdk/core';
	import { createLoanTx } from '$lib/contract/lendingTx.ts';
	import {
		showCustomToast,
		getImageUrl,
		setPlaceholderImage,
		nFormatter,
		isWalletConected
	} from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import { get } from 'svelte/store';

	export let showModal = false;
	
	let processing = false;
	let showErgopayModal = false;
	let unsignedTx = null;
	let currentHeight = 0;
	let userAssets = [];
	let loadingAssets = false;

	// Form data
	let selectedLoanTokens = [];
	let collateralType = 'erg'; // 'erg' or 'token'
	let collateralTokenId = '';
	let collateralAmount = '';
	let feePercent = LENDING_MIN_FEE_PERCENT; // Default 3%
	let durationBlocks = 1440; // Default ~24 hours (assuming 1 block per minute)
	let lendingFeeErg = '0.01'; // Default 0.01 ERG fee

	// Asset selection
	let showAssetSelector = false;
	let selectedAssetAmounts = new Map();

	onMount(async () => {
		currentHeight = await getBlockHeight();
		if ($connected_wallet_address) {
			await loadUserAssets();
		}
	});

	$: connected_wallet_address.subscribe(async (address) => {
		if (address) {
			await loadUserAssets();
		} else {
			userAssets = [];
		}
	});

	async function loadUserAssets() {
		if (!$connected_wallet_address) return;
		
		loadingAssets = true;
		try {
			const boxes = await fetchBoxes($connected_wallet_address);
			const allAssets = boxes.flatMap(box => box.assets || []);
			
			// Group assets by tokenId and sum amounts
			const assetMap = new Map();
			allAssets.forEach(asset => {
				const existing = assetMap.get(asset.tokenId) || { 
					tokenId: asset.tokenId, 
					amount: BigInt(0),
					name: asset.name || 'Unknown Token',
					decimals: asset.decimals || 0
				};
				existing.amount += BigInt(asset.amount);
				assetMap.set(asset.tokenId, existing);
			});
			
			userAssets = Array.from(assetMap.values()).filter(asset => asset.amount > 0);
		} catch (error) {
			console.error('Error loading user assets:', error);
			showCustomToast('Failed to load your assets', 3000, 'danger');
		}
		loadingAssets = false;
	}

	function toggleAssetSelection(asset: any) {
		const index = selectedLoanTokens.findIndex(token => token.tokenId === asset.tokenId);
		if (index >= 0) {
			selectedLoanTokens.splice(index, 1);
			selectedAssetAmounts.delete(asset.tokenId);
		} else {
			selectedLoanTokens.push(asset);
			selectedAssetAmounts.set(asset.tokenId, '1');
		}
		selectedLoanTokens = [...selectedLoanTokens];
	}

	function updateAssetAmount(tokenId: string, amount: string) {
		selectedAssetAmounts.set(tokenId, amount);
	}

	function isAssetSelected(asset: any): boolean {
		return selectedLoanTokens.some(token => token.tokenId === asset.tokenId);
	}

	async function createLoan() {
		console.log('🏦 User attempting to create loan offer...');
		console.log('👤 User address:', $connected_wallet_address);
		
		if (!isWalletConected()) {
			console.log('❌ Wallet not connected');
			showCustomToast('Please connect your wallet first', 3000, 'info');
			return;
		}

		if (selectedLoanTokens.length === 0) {
			console.log('❌ No tokens selected for lending');
			showCustomToast('Please select at least one token to lend', 3000, 'warning');
			return;
		}

		if (!collateralAmount || parseFloat(collateralAmount) <= 0) {
			console.log('❌ Invalid collateral amount:', collateralAmount);
			showCustomToast('Please specify collateral amount', 3000, 'warning');
			return;
		}

		if (!lendingFeeErg || parseFloat(lendingFeeErg) <= 0) {
			console.log('❌ Invalid lending fee:', lendingFeeErg);
			showCustomToast('Please specify lending fee', 3000, 'warning');
			return;
		}

		if (durationBlocks < 100) {
			console.log('❌ Duration too short:', durationBlocks, 'blocks');
			showCustomToast('Duration must be at least 100 blocks', 3000, 'warning');
			return;
		}

		console.log('🎯 USER LOAN CREATION ATTEMPT:');
		console.log('🔹 User:', $connected_wallet_address);
		console.log('🔹 Selected tokens to lend:', selectedLoanTokens.map(t => ({
			name: t.name,
			tokenId: t.tokenId,
			userAmount: selectedAssetAmounts.get(t.tokenId)
		})));
		console.log('🔹 Collateral type:', collateralType);
		console.log('🔹 Collateral amount:', collateralAmount, collateralType === 'erg' ? 'ERG' : 'tokens');
		console.log('🔹 Collateral token ID:', collateralType === 'token' ? collateralTokenId : 'N/A (ERG)');
		console.log('🔹 Lending fee:', lendingFeeErg, 'ERG');
		console.log('🔹 Fee percentage:', feePercent, 'basis points');
		console.log('🔹 Duration:', durationBlocks, 'blocks (~' + formatDuration(durationBlocks) + ')');
		console.log('🔹 Estimated APR:', calculateAPR() + '%');

		processing = true;

		try {
			console.log('🔧 Processing loan tokens...');
			// Prepare loan tokens with specified amounts
			const loanTokens = selectedLoanTokens.map(token => {
				const userAmount = selectedAssetAmounts.get(token.tokenId) || '1';
				const adjustedAmount = BigInt(userAmount) * BigInt(10 ** (token.decimals || 0));
				console.log(`  📦 Token: ${token.name} (${token.tokenId})`);
				console.log(`     - User wants to lend: ${userAmount} (${adjustedAmount} raw units)`);
				console.log(`     - Decimals: ${token.decimals || 0}`);
				return {
					tokenId: token.tokenId,
					amount: adjustedAmount
				};
			});

			console.log('✅ Final loan tokens prepared:', loanTokens);

			console.log('🔍 SECURE VERSION: Validating user has loan tokens to lock...');
			// SECURE: Alice must have the tokens to lock them in the contract
			for (const loanToken of loanTokens) {
				const userToken = userAssets.find(asset => asset.tokenId === loanToken.tokenId);
				console.log(`  🔹 Checking ${loanToken.tokenId}:`);
				console.log(`     - Required to lock: ${loanToken.amount}`);
				console.log(`     - Available: ${userToken?.amount || 'NOT FOUND'}`);
				console.log(`     - Sufficient: ${userToken && userToken.amount >= loanToken.amount ? 'YES' : 'NO'}`);
				
				if (!userToken || userToken.amount < loanToken.amount) {
					throw new Error(`Insufficient balance for ${loanToken.tokenId} - need ${loanToken.amount} but only have ${userToken?.amount || 0}`);
				}
			}

			console.log('🔧 Processing collateral requirements...');
			// Prepare collateral info
			const collateralTokenIdBytes = collateralType === 'token' ? collateralTokenId : '';
			const collateralAmountBigInt = collateralType === 'erg' 
				? BigInt(parseFloat(collateralAmount) * 1e9) // Convert ERG to nanoERG
				: BigInt(parseFloat(collateralAmount) * 1e9); // Assume token decimals handled elsewhere

			console.log(`  💰 Collateral details:`);
			console.log(`     - Type: ${collateralType}`);
			console.log(`     - Token ID: ${collateralTokenIdBytes || 'N/A (ERG)'}`);
			console.log(`     - Amount: ${collateralAmount} (${collateralAmountBigInt} raw units)`);

			const lendingFeeBigInt = BigInt(parseFloat(lendingFeeErg) * 1e9); // Convert to nanoERG
			console.log(`  💸 Lending fee: ${lendingFeeErg} ERG (${lendingFeeBigInt} nanoERG)`);
			console.log(`  ⏱️ Duration: ${durationBlocks} blocks (${formatDuration(durationBlocks)})`);
			console.log(`  📊 Fee percentage: ${feePercent} basis points`);
			console.log(`  📈 Estimated APR: ${calculateAPR()}%`);

			console.log('🔍 Fetching user UTXOs for loan creation...');
			// Get user UTXOs
			const userBoxes = await fetchBoxes($connected_wallet_address);
			console.log(`  📦 Total user boxes found: ${userBoxes.length}`);
			
			// SECURE VERSION: Filter UTXOs that contain the required loan tokens
			const utxos = userBoxes.filter(box => {
				// Filter boxes that contain the required loan tokens to lock
				if (loanTokens.length === 0) return BigInt(box.value) >= BigInt(RECOMMENDED_MIN_FEE_VALUE);
				
				return loanTokens.every(loanToken => {
					return box.assets?.some(asset => 
						asset.tokenId === loanToken.tokenId && 
						BigInt(asset.amount) >= loanToken.amount
					);
				});
			});

			console.log(`  ✅ Suitable UTXOs found: ${utxos.length}`);
			if (utxos.length === 0) {
				console.log('❌ No suitable UTXOs found - cannot create loan');
				throw new Error('No suitable UTXOs found for loan creation');
			}

			console.log('🏗️ CREATING LOAN TRANSACTION...');
			console.log('🏦 Final loan creation parameters:');
			console.log({
				lenderAddress: $connected_wallet_address,
				loanTokens: loanTokens.map(t => ({ ...t, amount: t.amount.toString() })),
				collateralTokenIdBytes,
				collateralAmountBigInt: collateralAmountBigInt.toString(),
				feePercent,
				durationBlocks,
				lendingFeeBigInt: lendingFeeBigInt.toString(),
				utxoCount: utxos.length,
				currentHeight
			});

			const unsigned = createLoanTx(
				$connected_wallet_address,
				loanTokens,
				collateralTokenIdBytes,
				collateralAmountBigInt,
				feePercent,
				durationBlocks,
				lendingFeeBigInt,
				utxos,
				currentHeight
			);

			console.log('✅ Transaction created successfully, proceeding to sign...');

			if ($selected_wallet_ergo === 'ergopay') {
				console.log('📱 Using Ergopay for transaction signing');
				unsignedTx = unsigned;
				showErgopayModal = true;
			} else {
				console.log('💻 Using regular wallet for transaction signing');
				if (!window.ergo) {
					throw new Error('Wallet not connected');
				}
				
				console.log('✍️ Signing transaction...');
				const signed = await window.ergo.sign_tx(unsigned);
				
				console.log('📤 Submitting transaction...');
				const transactionId = await window.ergo.submit_tx(signed);

				console.log('🎉 LOAN OFFER CREATED SUCCESSFULLY!');
				console.log('🔗 Transaction ID:', transactionId);
				console.log('🌐 Explorer link:', `https://ergexplorer.com/transactions/${transactionId}`);

				showCustomToast(
					`Loan offer created successfully! TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Reset form
				resetForm();
				showModal = false;
			}
		} catch (error) {
			console.error('Create loan error:', error);
			showCustomToast(`Failed to create loan: ${error.message}`, 5000, 'danger');
		}

		processing = false;
	}

	function resetForm() {
		selectedLoanTokens = [];
		selectedAssetAmounts.clear();
		collateralType = 'erg';
		collateralTokenId = '';
		collateralAmount = '';
		feePercent = LENDING_MIN_FEE_PERCENT;
		durationBlocks = 1440;
		lendingFeeErg = '0.01';
		showAssetSelector = false;
	}

	function closeModal() {
		showModal = false;
		resetForm();
	}

	function formatDuration(blocks: number): string {
		const hours = Math.round(blocks / 60); // Assuming 1 block per minute
		if (hours < 24) return `${hours} hours`;
		const days = Math.round(hours / 24);
		return `${days} days`;
	}

	function calculateAPR(): string {
		if (!lendingFeeErg || !collateralAmount || parseFloat(collateralAmount) === 0) return '0';
		
		const fee = parseFloat(lendingFeeErg);
		const collateral = parseFloat(collateralAmount);
		const durationHours = durationBlocks / 60;
		const durationYears = durationHours / (24 * 365);
		
		const apr = (fee / collateral) / durationYears * 100;
		return apr.toFixed(2);
	}
</script>

{#if showModal}
	<div class="modal-overlay" on:click={closeModal}>
		<div class="modal-content" on:click={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Create Loan Offer</h2>
				<button class="close-btn" on:click={closeModal}>&times;</button>
			</div>

			<div class="modal-body">
				{#if !$connected_wallet_address}
					<div class="connect-prompt">
						<div class="connect-icon">🔒</div>
						<p>Please connect your wallet to create a loan offer</p>
					</div>
				{:else}
					<div class="form-section">
						<h3>Loan Tokens</h3>
						<p class="section-description">Select tokens you want to lend out</p>
						
						{#if selectedLoanTokens.length === 0}
							<div class="no-selection">
								<p>No tokens selected for lending</p>
								<button class="select-btn" on:click={() => showAssetSelector = !showAssetSelector}>
									{showAssetSelector ? 'Hide' : 'Select'} Tokens
								</button>
							</div>
						{:else}
							<div class="selected-tokens">
								{#each selectedLoanTokens as token}
									<div class="token-item">
										<div class="token-info">
											<img 
												src={getImageUrl(token, true)} 
												alt={token.name}
												class="token-image"
												onerror={(e) => setPlaceholderImage(e, token)}
											/>
											<div class="token-details">
												<span class="token-name">{token.name || 'Unknown Token'}</span>
												<span class="token-balance">Balance: {nFormatter(Number(token.amount) / (10 ** (token.decimals || 0)))}</span>
											</div>
										</div>
										<div class="amount-input">
											<input 
												type="number" 
												min="1" 
												max={Number(token.amount) / (10 ** (token.decimals || 0))}
												step="0.0001"
												value={selectedAssetAmounts.get(token.tokenId) || ''}
												oninput={(e) => updateAssetAmount(token.tokenId, e.target.value)}
												placeholder="Amount"
											/>
											<button class="remove-btn" on:click={() => toggleAssetSelection(token)}>×</button>
										</div>
									</div>
								{/each}
								<button class="add-more-btn" on:click={() => showAssetSelector = !showAssetSelector}>
									{showAssetSelector ? 'Hide' : 'Add More'} Tokens
								</button>
							</div>
						{/if}

						{#if showAssetSelector}
							<div class="asset-selector">
								<h4>Your Assets</h4>
								{#if loadingAssets}
									<div class="loading">Loading your assets...</div>
								{:else if userAssets.length === 0}
									<div class="no-assets">No tokens found in your wallet</div>
								{:else}
									<div class="assets-grid">
										{#each userAssets as asset}
											<div 
												class="asset-item {isAssetSelected(asset) ? 'selected' : ''}"
												on:click={() => toggleAssetSelection(asset)}
											>
												<img 
													src={getImageUrl(asset, true)} 
													alt={asset.name}
													class="asset-image"
													onerror={(e) => setPlaceholderImage(e, asset)}
												/>
												<div class="asset-info">
													<span class="asset-name">{asset.name || 'Unknown'}</span>
													<span class="asset-amount">{nFormatter(Number(asset.amount) / (10 ** (asset.decimals || 0)))}</span>
												</div>
												{#if isAssetSelected(asset)}
													<div class="selected-check">✓</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<div class="form-section">
						<h3>Collateral Requirements</h3>
						<p class="section-description">What collateral should borrowers provide?</p>
						
						<div class="collateral-type">
							<label>
								<input type="radio" bind:group={collateralType} value="erg" />
								ERG Collateral
							</label>
							<label>
								<input type="radio" bind:group={collateralType} value="token" />
								Token Collateral
							</label>
						</div>

						{#if collateralType === 'erg'}
							<div class="input-group">
								<label>ERG Amount Required</label>
								<input 
									type="number" 
									bind:value={collateralAmount} 
									min="0.001" 
									step="0.001"
									placeholder="e.g., 10.0"
								/>
								<span class="input-suffix">ERG</span>
							</div>
						{:else}
							<div class="input-group">
								<label>Token ID</label>
								<input 
									type="text" 
									bind:value={collateralTokenId} 
									placeholder="Token ID for collateral"
								/>
							</div>
							<div class="input-group">
								<label>Token Amount Required</label>
								<input 
									type="number" 
									bind:value={collateralAmount} 
									min="1" 
									step="1"
									placeholder="e.g., 1000"
								/>
							</div>
						{/if}
					</div>

					<div class="form-section">
						<h3>Loan Terms</h3>
						
						<div class="input-group">
							<label>Lending Fee</label>
							<input 
								type="number" 
								bind:value={lendingFeeErg} 
								min="0.001" 
								step="0.001"
								placeholder="0.01"
							/>
							<span class="input-suffix">ERG</span>
						</div>

						<div class="input-group">
							<label>Fee Percentage (for platform)</label>
							<input 
								type="number" 
								bind:value={feePercent} 
								min={LENDING_MIN_FEE_PERCENT}
								max="10000"
								step="100"
							/>
							<span class="input-suffix">basis points (min {LENDING_MIN_FEE_PERCENT})</span>
						</div>

						<div class="input-group">
							<label>Loan Duration</label>
							<input 
								type="number" 
								bind:value={durationBlocks} 
								min="100" 
								step="60"
								placeholder="1440"
							/>
							<span class="input-suffix">blocks (~{formatDuration(durationBlocks)})</span>
						</div>
					</div>

					<div class="summary-section">
						<h3>Loan Summary</h3>
						<div class="summary-grid">
							<div class="summary-item">
								<span class="summary-label">Tokens to Lend:</span>
								<span class="summary-value">{selectedLoanTokens.length} token{selectedLoanTokens.length !== 1 ? 's' : ''}</span>
							</div>
							<div class="summary-item">
								<span class="summary-label">Collateral Required:</span>
								<span class="summary-value">
									{collateralAmount || '0'} {collateralType === 'erg' ? 'ERG' : 'Tokens'}
								</span>
							</div>
							<div class="summary-item">
								<span class="summary-label">Lending Fee:</span>
								<span class="summary-value">{lendingFeeErg || '0'} ERG</span>
							</div>
							<div class="summary-item">
								<span class="summary-label">Estimated APR:</span>
								<span class="summary-value">{calculateAPR()}%</span>
							</div>
							<div class="summary-item">
								<span class="summary-label">Duration:</span>
								<span class="summary-value">{formatDuration(durationBlocks)}</span>
							</div>
						</div>
					</div>

					<div class="modal-footer">
						<button class="cancel-btn" on:click={closeModal}>Cancel</button>
						<button 
							class="create-btn" 
							on:click={createLoan} 
							disabled={processing || selectedLoanTokens.length === 0}
						>
							{processing ? 'Creating...' : 'Create Loan Offer'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showModal={showErgopayModal} bind:transactionData={unsignedTx} />
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: var(--forms-bg);
		border-radius: 12px;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		color: var(--text);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--text);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background 0.2s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.modal-body {
		padding: 20px;
	}

	.connect-prompt {
		text-align: center;
		padding: 40px 20px;
		color: var(--text);
	}

	.connect-icon {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.form-section {
		margin-bottom: 24px;
		padding-bottom: 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.form-section:last-child {
		border-bottom: none;
	}

	.form-section h3 {
		color: var(--text);
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.section-description {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
		margin: 0 0 16px 0;
	}

	.no-selection {
		text-align: center;
		padding: 20px;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		border: 2px dashed rgba(255, 255, 255, 0.1);
	}

	.select-btn {
		background: var(--main-color);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 8px 16px;
		font-size: 0.85rem;
		cursor: pointer;
		margin-top: 8px;
	}

	.selected-tokens {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		padding: 16px;
	}

	.token-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		margin-bottom: 8px;
	}

	.token-info {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
	}

	.token-image {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
	}

	.token-details {
		display: flex;
		flex-direction: column;
	}

	.token-name {
		color: var(--text);
		font-weight: 600;
		font-size: 0.85rem;
	}

	.token-balance {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.75rem;
	}

	.amount-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.amount-input input {
		background: var(--footer);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 6px 8px;
		color: var(--text);
		font-size: 0.85rem;
		width: 100px;
	}

	.remove-btn {
		background: #ef4444;
		color: white;
		border: none;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.add-more-btn {
		background: transparent;
		color: var(--main-color);
		border: 1px solid var(--main-color);
		border-radius: 6px;
		padding: 8px 16px;
		font-size: 0.8rem;
		cursor: pointer;
		width: 100%;
		margin-top: 8px;
	}

	.asset-selector {
		margin-top: 16px;
		padding: 16px;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
	}

	.asset-selector h4 {
		color: var(--text);
		font-size: 0.9rem;
		margin: 0 0 12px 0;
	}

	.loading, .no-assets {
		text-align: center;
		color: rgba(255, 255, 255, 0.6);
		padding: 20px;
	}

	.assets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.asset-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		cursor: pointer;
		border: 2px solid transparent;
		transition: all 0.2s;
		position: relative;
	}

	.asset-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.asset-item.selected {
		border-color: var(--main-color);
		background: rgba(159, 4, 255, 0.1);
	}

	.asset-image {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
		margin-bottom: 4px;
	}

	.asset-info {
		text-align: center;
	}

	.asset-name {
		color: var(--text);
		font-size: 0.75rem;
		font-weight: 600;
		display: block;
	}

	.asset-amount {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.7rem;
	}

	.selected-check {
		position: absolute;
		top: 4px;
		right: 4px;
		background: var(--main-color);
		color: white;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.6rem;
	}

	.collateral-type {
		display: flex;
		gap: 16px;
		margin-bottom: 16px;
	}

	.collateral-type label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.input-group {
		margin-bottom: 16px;
		position: relative;
	}

	.input-group label {
		display: block;
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.input-group input {
		width: 100%;
		background: var(--footer);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 10px 12px;
		color: var(--text);
		font-size: 0.9rem;
	}

	.input-group input:focus {
		outline: none;
		border-color: var(--main-color);
	}

	.input-suffix {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
		pointer-events: none;
	}

	.summary-section {
		background: rgba(255, 255, 255, 0.02);
		padding: 16px;
		border-radius: 8px;
		margin-bottom: 20px;
	}

	.summary-section h3 {
		margin: 0 0 12px 0;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.summary-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
	}

	.summary-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
	}

	.summary-value {
		color: var(--text);
		font-weight: 600;
		font-size: 0.8rem;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.cancel-btn {
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 10px 20px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.create-btn {
		background: var(--main-color);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 10px 20px;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.create-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.modal-content {
			margin: 10px;
			max-height: 95vh;
		}

		.summary-grid {
			grid-template-columns: 1fr;
		}

		.assets-grid {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		}
	}
</style>