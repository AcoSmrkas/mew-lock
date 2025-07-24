<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo } from '$lib/store/store';
	import { DELEGATE_CONTRACT_V3, EE_API, ASSETS } from '$lib/common/const.ts';
	import { RECOMMENDED_MIN_FEE_VALUE } from '@fleet-sdk/core';
	import { ErgoAddress } from '@fleet-sdk/core';
	import {
		activateDelegationV3Tx,
		withdrawDelegationV3Tx,
		cancelDelegationV3Tx,
		parseFeeConfig
	} from '$lib/contract/delegationV3Tx.ts';
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

	let delegations = [];
	let originalBoxes = new Map(); // Store original box data by boxId
	let loadComplete = false;
	let currentHeight = 0;
	let processing = {};
	let showErgopayModal = false;
	let unsignedTx = null;
	let currentAssetIndex = {}; // Track current asset index for each delegation

	// Helper function to get token name from token ID
	function getFeeTokenName(tokenId: string): string {
		if (!tokenId) return 'ERG';

		// Check in ASSETS first
		const asset = ASSETS.find((a) => a.tokenId === tokenId || a.tokenid === tokenId);
		if (asset) return asset.name;

		// Check in delegation's own tokens
		for (const delegation of delegations) {
			const token = delegation.tokens.find((t) => t.tokenId === tokenId);
			if (token && token.name) return token.name;
		}

		// Return truncated token ID if name not found
		return `${tokenId.substring(0, 8)}...`;
	}

	// Helper function to format fee amount with correct decimals
	function formatFeeAmount(amount: bigint, tokenId: string): string {
		if (!tokenId) {
			// ERG has 9 decimals
			return nFormatter(Number(amount) / 1e9);
		}

		// Check token decimals in ASSETS
		const asset = ASSETS.find((a) => a.tokenId === tokenId || a.tokenid === tokenId);
		if (asset && asset.decimals !== undefined) {
			const divisor = Math.pow(10, asset.decimals);
			return nFormatter(Number(amount) / divisor);
		}

		// Check in delegation tokens
		for (const delegation of delegations) {
			const token = delegation.tokens.find((t) => t.tokenId === tokenId);
			if (token && token.decimals !== undefined) {
				const divisor = Math.pow(10, token.decimals);
				return nFormatter(Number(amount) / divisor);
			}
		}

		// Default to 9 decimals if not found
		return nFormatter(Number(amount) / 1e9);
	}

	onMount(async () => {
		await fetchDelegations();
		currentHeight = await getBlockHeight();
		loadComplete = true;
	});

	// Convert public key to Ergo address
	function convertPKToAddress(pkRegister: any): string {
		try {
			// Get the serialized value (public key)
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

	// Parse delegation data with new V3 contract structure
	function parseDelegation(box: any) {
		// Convert public keys to readable addresses
		const delegatorAddress = convertPKToAddress(box.additionalRegisters.R4);
		const delegateAddress = convertPKToAddress(box.additionalRegisters.R5);

		// Parse new fee configuration structure using the parseFeeConfig function
		const feeConfig = parseFeeConfig(box);
		const feeAmount = feeConfig.feeAmount;
		const feeTokenId = feeConfig.feeTokenId;
		const feePercent = feeConfig.feePercent;
		const minFeeBlocks = feeConfig.minFeeBlocks;

		return {
			boxId: box.boxId,
			delegator: delegatorAddress,
			delegate: delegateAddress,
			duration: parseInt(box.additionalRegisters.R6.renderedValue || box.additionalRegisters.R6), // R6 = duration
			state: parseInt(box.additionalRegisters.R7.renderedValue || box.additionalRegisters.R7), // R7 = state
			feeConfig: feeConfig, // Store raw fee config for transaction building
			feeAmount: feeAmount,
			feeTokenId: feeTokenId,
			feePercent: feePercent,
			minFeeBlocks: minFeeBlocks,
			tokens: box.assets || [],
			creationHeight: box.creationHeight || box.settlementHeight || 0, // From API
			transactionId: box.transactionId,
			value: BigInt(box.value)
		};
	}

	async function fetchDelegations() {
		try {
			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${DELEGATE_CONTRACT_V3}`
			);
			const data = await response.json();

			const filteredBoxes = data.items.filter(
				(box) =>
					box.additionalRegisters?.R4 &&
					box.additionalRegisters?.R5 &&
					box.additionalRegisters?.R6 &&
					box.additionalRegisters?.R7 &&
					box.additionalRegisters?.R8
			);

			// Store original boxes and parse delegations
			originalBoxes.clear();
			filteredBoxes.forEach((box) => {
				originalBoxes.set(box.boxId, box);
			});

			delegations = filteredBoxes.map(parseDelegation).slice(0, 8); // Show top 8 on landing
		} catch (error) {
			console.error('Error fetching delegations:', error);
			showCustomToast('Failed to fetch delegations', 3000, 'danger');
		}
	}

	async function handleDelegationAction(action: string, delegation: any) {
		if (!$selected_wallet_ergo) {
			showCustomToast('Connect wallet first.', 1500, 'info');
			return;
		}

		// Check wallet connection - ErgoPay doesn't use ergoConnector
		if (
			$selected_wallet_ergo !== 'ergopay' &&
			!window.ergoConnector[$selected_wallet_ergo]?.isConnected
		) {
			showCustomToast('Connect wallet first.', 1500, 'info');
			return;
		}

		// For ErgoPay, check if we have a connected wallet address
		if ($selected_wallet_ergo === 'ergopay' && !$connected_wallet_address) {
			showCustomToast('Connect wallet first.', 1500, 'info');
			return;
		}

		if (processing[delegation.boxId]) return;
		processing[delegation.boxId] = true;

		try {
			let myAddress, height;

			if ($selected_wallet_ergo === 'ergopay') {
				// For ErgoPay, use connected wallet address and current block height
				myAddress = $connected_wallet_address;
				height = currentHeight;
			} else {
				// For other wallets, use the standard wallet API
				myAddress = $connected_wallet_address;
				height = currentHeight;
			}

			// Get the original box data
			const originalBox = originalBoxes.get(delegation.boxId);
			if (!originalBox) {
				throw new Error('Delegation box not found (may have been spent)');
			}

			// Clone and prepare box with serialized register values
			let box = JSON.parse(JSON.stringify(originalBox));
			for (const [k, v] of Object.entries(box.additionalRegisters)) {
				box.additionalRegisters[k] = v.serializedValue;
			}

			let unsigned;

			switch (action) {
				case 'activate':
					// Parse fee configuration from delegation
					const feeConfig = parseFeeConfig(originalBox);
					console.log('🔍 Fee config extracted:', feeConfig);

					let additionalUtxos;
					const userBoxes = await fetchBoxes(myAddress);
					console.log('📦 Total user boxes fetched:', userBoxes.length);

					if (feeConfig.feeTokenId) {
						// TOKEN FEE (MEW) - need boxes with the specific token + enough ERG for tx fees
						console.log('💰 Looking for token fee UTXOs with token ID:', feeConfig.feeTokenId);

						// Find boxes with MEW tokens
						const tokenBoxes = userBoxes.filter((box) => {
							if (!box.assets || box.assets.length === 0) return false;
							return box.assets.some((asset) => asset.tokenId === feeConfig.feeTokenId);
						});

						// Also need boxes with enough ERG for transaction fees
						const ergBoxes = userBoxes.filter(
							(box) => BigInt(box.value) >= BigInt(RECOMMENDED_MIN_FEE_VALUE)
						);

						// Combine unique boxes (token boxes + erg boxes)
						const combinedBoxes = [
							...new Map([...tokenBoxes, ...ergBoxes].map((box) => [box.boxId, box])).values()
						];
						additionalUtxos = combinedBoxes;

						console.log('📊 Token boxes found:', tokenBoxes.length);
						console.log('📊 ERG boxes found:', ergBoxes.length);
						console.log('📊 Combined UTXOs for activation:', additionalUtxos.length);
					} else {
						// ERG FEE - need boxes with enough ERG value
						const totalNeeded = feeConfig.feeAmount + BigInt(RECOMMENDED_MIN_FEE_VALUE);
						console.log('💰 Looking for ERG fee UTXOs, total needed:', totalNeeded.toString());

						if ($selected_wallet_ergo === 'ergopay') {
							additionalUtxos = userBoxes.filter((box) => box.value >= totalNeeded.toString());
						} else {
							additionalUtxos = userBoxes.filter((box) => BigInt(box.value) >= totalNeeded);
						}
						console.log('📊 ERG UTXOs found:', additionalUtxos.length);
					}

					unsigned = activateDelegationV3Tx(
						box,
						myAddress,
						height,
						additionalUtxos,
						feeConfig.feeAmount,
						feeConfig.feeTokenId
					);
					break;

				case 'withdraw':
				case 'withdrawCancelled':
					// Request enough for mining fee
					const withdrawAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);

					let withdrawUtxos;
					if ($selected_wallet_ergo === 'ergopay') {
						const userBoxes = await fetchBoxes(myAddress);
						withdrawUtxos = userBoxes.filter((box) => box.value >= withdrawAmount.toString());
					} else {
						const userBoxes = await fetchBoxes(myAddress);
						withdrawUtxos = userBoxes.filter((box) => BigInt(box.value) >= withdrawAmount);
					}

					unsigned = withdrawDelegationV3Tx(box, myAddress, height, withdrawUtxos);
					break;

				case 'cancel':
					// Emergency cancel delegation
					const cancelAmount = BigInt(RECOMMENDED_MIN_FEE_VALUE);

					let cancelUtxos;
					if ($selected_wallet_ergo === 'ergopay') {
						const userBoxes = await fetchBoxes(myAddress);
						cancelUtxos = userBoxes.filter((box) => box.value >= cancelAmount.toString());
					} else {
						const userBoxes = await fetchBoxes(myAddress);
						cancelUtxos = userBoxes.filter((box) => BigInt(box.value) >= cancelAmount);
					}

					unsigned = cancelDelegationV3Tx(box, myAddress, height, cancelUtxos);
					break;

				default:
					throw new Error(`Unsupported action: ${action}`);
			}

			if ($selected_wallet_ergo === 'ergopay') {
				unsignedTx = unsigned;
				showErgopayModal = true;
			} else {
				// For regular wallets, use window.ergo directly
				if (!window.ergo) {
					throw new Error('Wallet not connected');
				}
				const signed = await window.ergo.sign_tx(unsigned);
				const transactionId = await window.ergo.submit_tx(signed);

				showCustomToast(
					`Transaction submitted successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Refresh delegations after successful transaction
				setTimeout(() => fetchDelegations(), 3000);
			}
		} catch (error) {
			console.error(`${action} Error:`, error);
			showCustomToast(`${action} failed: ${error.message}`, 3000, 'danger');
		}

		processing[delegation.boxId] = false;
	}

	function getStateLabel(state: number, delegation: any): string {
		const expired = isExpired(delegation);

		if (expired && (state === 1 || state === 2)) {
			return 'Expired';
		}

		switch (state) {
			case 1:
				return 'Pending';
			case 2:
				return 'Active';
			case 3:
				return 'Cancelled';
			default:
				return 'Unknown';
		}
	}

	function getStateColor(state: number, delegation: any): string {
		const expired = isExpired(delegation);

		if (expired && (state === 1 || state === 2)) {
			return 'text-gray-400'; // Expired color
		}

		switch (state) {
			case 1:
				return 'text-yellow-400'; // Pending
			case 2:
				return 'text-green-400'; // Active
			case 3:
				return 'text-red-400'; // Cancelled
			default:
				return 'text-gray-400';
		}
	}

	function isExpired(delegation: any): boolean {
		return currentHeight > delegation.creationHeight + delegation.duration;
	}

	function getRemainingTime(delegation: any): string {
		const remaining = delegation.creationHeight + delegation.duration - currentHeight;
		if (remaining <= 0) return 'Expired';
		return `${remaining} blocks`;
	}

	function getExpiryBlock(delegation: any): number {
		return delegation.creationHeight + delegation.duration;
	}

	function nextAsset(delegationId: string, totalAssets: number) {
		if (!currentAssetIndex[delegationId]) currentAssetIndex[delegationId] = 0;
		currentAssetIndex[delegationId] = (currentAssetIndex[delegationId] + 1) % totalAssets;
		currentAssetIndex = { ...currentAssetIndex }; // Trigger reactivity
	}

	function prevAsset(delegationId: string, totalAssets: number) {
		if (!currentAssetIndex[delegationId]) currentAssetIndex[delegationId] = 0;
		currentAssetIndex[delegationId] =
			(currentAssetIndex[delegationId] - 1 + totalAssets) % totalAssets;
		currentAssetIndex = { ...currentAssetIndex }; // Trigger reactivity
	}

	function getCurrentAssetIndex(delegationId: string): number {
		return currentAssetIndex[delegationId] || 0;
	}

	// Enhanced role detection with better error handling
	function checkUserRole(
		delegation: any,
		userAddress: string
	): { isDelegator: boolean; isDelegate: boolean } {
		let isDelegator = false;
		let isDelegate = false;

		try {
			// Try different data formats for delegator
			const delegatorData = delegation.delegator;
			if (delegatorData) {
				// If it's already an address
				if (typeof delegatorData === 'string' && delegatorData.length === 51) {
					isDelegator = delegatorData === userAddress;
				}
			}

			// Try different data formats for delegate
			const delegateData = delegation.delegate;
			if (delegateData) {
				// If it's already an address
				if (typeof delegateData === 'string' && delegateData.length === 51) {
					isDelegate = delegateData === userAddress;
				}
			}
		} catch (error) {
			console.error('Error checking user roles:', error, delegation);
		}

		return { isDelegator, isDelegate };
	}

	function getEnhancedActions(delegation: any, userAddress: string, currentHeight: number) {
		const { isDelegator, isDelegate } = checkUserRole(delegation, userAddress);
		const isExpired = currentHeight > delegation.creationHeight + delegation.duration;

		if (isDelegator) {
			if (delegation.state === 1) {
				return [{ action: 'withdraw', label: 'Withdraw (Not Activated)', role: 'delegator' }];
			}
			if (delegation.state === 2) {
				if (isExpired) {
					return [{ action: 'withdraw', label: 'Withdraw (Expired)', role: 'delegator' }];
				} else {
					const remainingBlocks = delegation.creationHeight + delegation.duration - currentHeight;
					return [
						{ action: 'none', label: `${remainingBlocks} blocks remaining`, role: 'delegator' }
					];
				}
			}
			if (delegation.state === 3) {
				return [{ action: 'withdraw', label: 'Withdraw (Cancelled)', role: 'delegator' }];
			}
		}

		if (isDelegate) {
			if (delegation.state === 1 && !isExpired) {
				const feeDisplay = `${formatFeeAmount(
					delegation.feeAmount,
					delegation.feeTokenId
				)} ${getFeeTokenName(delegation.feeTokenId)}`;
				return [
					{
						action: 'activate',
						label: `Activate (${feeDisplay})`,
						role: 'delegate'
					}
				];
			}
		}

		// Return role info even if no actions available
		if (isDelegator || isDelegate) {
			return [
				{
					action: 'none',
					label: 'No actions available',
					role: isDelegator ? 'delegator' : 'delegate'
				}
			];
		}

		return [{ action: 'none', label: 'Not your delegation', role: 'none' }];
	}
</script>

{#if loadComplete && delegations.length > 0}
	<div class="delegation-grid">
		{#each delegations as delegation, index}
			{@const { isDelegator, isDelegate } = checkUserRole(delegation, $connected_wallet_address)}
			{@const currentIndex = getCurrentAssetIndex(delegation.boxId)}
			<div class="simple-card">
				<div class="card-content">
					<div class="assets-section">
						{#if delegation.tokens && delegation.tokens.length > 0}
							{#if delegation.tokens.length === 1}
								<!-- Single asset - show card-like image -->
								<div class="single-asset-card">
									<div class="image-container">
										<img
											src={getImageUrl(delegation.tokens[0], true)}
											alt={delegation.tokens[0].name || delegation.tokens[0].tokenId}
											class="single-asset-card-image"
											on:error={(event) => setPlaceholderImage(event, delegation.tokens[0])}
										/>
										<div class="status-dot {getStateColor(delegation.state, delegation)}" />
										<div class="amount-overlay">
											{nFormatter(
												Number(delegation.tokens[0].amount) /
													Math.pow(10, delegation.tokens[0].decimals || 0)
											)}
										</div>
									</div>
									<div class="single-asset-card-info">
										<div class="single-asset-card-name">
											{delegation.tokens[0].name || 'Unknown Token'}
										</div>
									</div>
								</div>
							{:else}
								<!-- Multiple assets - show scrollable list -->
								<div class="assets-list" class:scrollable={delegation.tokens.length > 3}>
									{#each delegation.tokens.slice(0, delegation.tokens.length > 3 ? 3 : delegation.tokens.length) as token}
										<div class="asset-item-with-image">
											<img
												src={getImageUrl(token, true)}
												alt={token.name || token.tokenId}
												class="small-asset-image"
												on:error={(event) => setPlaceholderImage(event, token)}
											/>
											<div class="asset-text-info">
												<span class="asset-name">{token.name || 'Unknown'}</span>
												<span class="asset-amount"
													>{nFormatter(
														Number(token.amount) / Math.pow(10, token.decimals || 0)
													)}</span
												>
											</div>
										</div>
									{/each}
									{#if delegation.tokens.length > 3}
										<div class="view-more-indicator">
											+{delegation.tokens.length - 3} more assets
										</div>
									{/if}
								</div>
							{/if}
						{:else}
							<div class="no-assets-display">
								<div class="no-assets-icon">📦</div>
								<div class="no-assets-text">ERG Only</div>
							</div>
						{/if}
					</div>

					<div class="addresses-section">
						<div class="address-row">
							<span class="address-label">From:</span>
							<span class="address-value {isDelegator ? 'your-address' : ''}"
								>{truncateAddress(delegation.delegator)}</span
							>
						</div>
						<div class="address-row">
							<span class="address-label">To:</span>
							<span class="address-value {isDelegate ? 'your-address' : ''}"
								>{truncateAddress(delegation.delegate)}</span
							>
						</div>
					</div>

					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Fee:</span>
							<span class="info-value">
								{formatFeeAmount(delegation.feeAmount, delegation.feeTokenId)}
								{getFeeTokenName(delegation.feeTokenId)}
							</span>
						</div>
						<div class="info-item">
							<span class="info-label">Remaining:</span>
							<span class="info-value">{getRemainingTime(delegation)}</span>
						</div>
					</div>

					<div class="card-footer">
						{#if $connected_wallet_address && (isDelegator || isDelegate)}
							{@const actions = getEnhancedActions(
								delegation,
								$connected_wallet_address,
								currentHeight
							)}
							{#if actions.length > 0 && actions[0].action !== 'none'}
								<button
									class="action-btn"
									disabled={processing[delegation.boxId]}
									on:click={() => handleDelegationAction(actions[0].action, delegation)}
								>
									{processing[delegation.boxId] ? 'Processing...' : actions[0].label}
								</button>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
{:else if loadComplete && delegations.length === 0}
	<div class="no-delegations text-center py-8 text-gray-400">
		<p>No delegations found.</p>
		<p class="text-sm">Create a delegation to get started!</p>
	</div>
{:else}
	<div class="w-100 relative min-h-[200px] col-span-12 my-6 bg-bg">
		<Loading />
	</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal
		bind:showErgopayModal
		bind:unsignedTx
		on:success={async () => {
			showCustomToast('Delegation action completed successfully via ErgoPay!', 5000, 'success');
			setTimeout(() => fetchDelegations(), 3000);
		}}
	>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.delegation-grid {
		display: grid;
		grid-template-columns: repeat(1, 1fr);
		gap: 20px;
		justify-content: space-between;
		margin-bottom: 34px;
	}

	@media (min-width: 400px) {
		.delegation-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 600px) {
		.delegation-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 800px) {
		.delegation-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (min-width: 1000px) {
		.delegation-grid {
			grid-template-columns: repeat(5, 1fr);
		}
	}

	/* Simple Compact Cards */
	.simple-card {
		background: var(--forms-bg);
		border: 1px solid var(--borders);
		border-radius: 12px;
		transition: all 0.2s ease;
		height: 300px;
		display: flex;
		flex-direction: column;
	}

	.simple-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(159, 4, 255, 0.2);
		border-color: var(--main-color);
	}

	.card-content {
		padding: 8px 12px 12px 12px;
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
		color: var(--secondary-color);
		background: rgba(var(--secondary-color-rgb, 16, 185, 129), 0.15);
	}

	.text-red-400 {
		color: #ef4444;
		background: rgba(239, 68, 68, 0.15);
	}

	.text-gray-400 {
		color: var(--text-light);
		background: rgba(var(--text-light-rgb, 156, 163, 175), 0.15);
	}

	.role-line {
		font-size: 0.7rem;
		color: var(--main-color);
		font-weight: 500;
		margin-bottom: 6px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.assets-section {
		flex: 1;
		margin-bottom: 8px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	/* Single Asset Card Display */
	.single-asset-card {
		display: flex;
		flex-direction: column;
		background: var(--footer);
		border-radius: 8px;
		padding: 8px;
		min-height: 100px;
		max-height: 100px;
	}

	.image-container {
		position: relative;
		width: 100%;
		height: 60px;
		margin-bottom: 6px;
	}

	.single-asset-card-image {
		width: 100%;
		height: 100%;
		border-radius: 6px;
		object-fit: contain;
		background: var(--background);
		padding: 4px;
	}

	.status-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1px solid var(--background);
	}

	.status-dot.text-green-400 {
		background-color: #10b981;
	}

	.status-dot.text-yellow-400 {
		background-color: var(--main-color);
	}

	.status-dot.text-red-400 {
		background-color: #ef4444;
	}

	.status-dot.text-gray-400 {
		background-color: var(--text-light);
	}

	.amount-overlay {
		position: absolute;
		bottom: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 600;
	}

	.single-asset-card-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: center;
	}

	.single-asset-card-name {
		font-size: 0.7rem;
		color: var(--text);
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Multiple Assets List */
	.assets-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 100px;
		max-height: 100px;
	}

	.assets-list.scrollable {
		overflow-y: visible;
		padding-right: 4px;
	}

	.assets-list.scrollable::-webkit-scrollbar {
		width: 4px;
	}

	.assets-list.scrollable::-webkit-scrollbar-track {
		background: var(--footer);
		border-radius: 2px;
	}

	.assets-list.scrollable::-webkit-scrollbar-thumb {
		background: var(--main-color);
		border-radius: 2px;
	}

	.asset-item-with-image {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px;
		background: var(--footer);
		border-radius: 6px;
	}

	.small-asset-image {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		object-fit: contain;
		background: var(--background);
		padding: 2px;
		flex-shrink: 0;
	}

	.asset-text-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex: 1;
		gap: 8px;
	}

	.asset-name {
		font-size: 0.65rem;
		color: var(--text);
		font-weight: 500;
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.asset-amount {
		font-size: 0.65rem;
		color: var(--main-color);
		font-weight: 600;
		white-space: nowrap;
	}

	.view-more-indicator {
		font-size: 0.7rem;
		color: var(--main-color);
		font-weight: 600;
		text-align: center;
		padding: 6px 8px;
		background: rgba(159, 4, 255, 0.1);
		border-radius: 6px;
		margin-top: 4px;
		border: 1px solid rgba(159, 4, 255, 0.2);
	}

	/* No Assets Display */
	.no-assets-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px;
		background: var(--footer);
		border-radius: 8px;
		color: var(--text-light);
	}

	.no-assets-icon {
		font-size: 2rem;
		margin-bottom: 8px;
		opacity: 0.5;
	}

	.no-assets-text {
		font-size: 0.8rem;
		font-weight: 500;
		opacity: 0.7;
	}

	/* Addresses Section */
	.addresses-section {
		margin-bottom: 8px;
		padding: 8px;
		background: var(--footer);
		border-radius: 6px;
	}

	.address-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
		padding: 0 2px;
	}

	.address-row:last-child {
		margin-bottom: 0;
	}

	.address-label {
		font-size: 0.65rem;
		color: var(--text-light);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.address-value {
		font-size: 0.7rem;
		color: var(--text);
		font-weight: 500;
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
		padding: 0 2px;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 6px;
		background: var(--footer);
		border-radius: 4px;
	}

	.info-label {
		font-size: 0.65rem;
		color: var(--text-light);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-value {
		font-size: 0.75rem;
		color: var(--text);
		font-weight: 600;
	}

	.card-footer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: auto;
	}

	.action-btn {
		background: var(--main-color);
		color: var(--background);
		border: none;
		border-radius: 8px;
		padding: 8px 12px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		width: 100%;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--secondary-color);
		transform: translateY(-1px);
	}

	.action-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status-display {
		text-align: center;
		padding: 8px 12px;
		background: var(--footer);
		border-radius: 8px;
		font-size: 0.75rem;
		color: var(--text-light);
		font-style: italic;
	}

	.no-delegations {
		text-align: center;
		padding: 3rem 1rem;
		background-color: var(--footer);
		border: 1px solid var(--borders);
		border-radius: 16px;
		color: var(--text-light);
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.delegation-grid {
			grid-template-columns: 1fr;
			padding: 0 0.5rem;
		}

		.delegation-item {
			height: auto;
			flex-direction: column;
			min-width: auto;
		}

		.image-container {
			width: 100%;
			height: 150px;
		}

		.token-image {
			border-radius: 12px 12px 0 0;
		}

		.no-image {
			border-radius: 12px 12px 0 0;
		}

		.details-and-price {
			padding: 12px;
		}

		.modal-box {
			width: 95%;
			margin: 1rem;
			max-height: 95vh;
		}

		.modal-content {
			padding: 0.75rem;
		}

		.modal-asset-image {
			width: 100px;
			height: 100px;
		}

		.modal-detail-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
			padding: 0.5rem;
		}

		.modal-header {
			padding: 0.75rem 1rem;
		}

		.modal-header h2 {
			font-size: 1rem;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.delegation-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 1025px) {
		.delegation-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	/* Asset Showcase */
	.asset-showcase {
		position: relative;
		height: 200px;
		background: linear-gradient(135deg, var(--forms-bg) 0%, var(--footer) 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.asset-main {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
	}

	.main-asset-image {
		width: 100px;
		height: 100px;
		border-radius: 12px;
		object-fit: contain;
		background: var(--background);
		padding: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		transition: transform 0.2s ease;
	}

	.main-asset-image:hover {
		transform: scale(1.05);
	}

	.asset-controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 1rem;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent);
		border-radius: 0 0 12px 12px;
	}

	.asset-nav {
		background: rgba(255, 255, 255, 0.9);
		border: none;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 1.2rem;
		color: var(--background);
	}

	.asset-nav:hover {
		background: var(--main-color);
		color: white;
		transform: scale(1.1);
	}

	.asset-indicators {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.5);
		transition: all 0.2s ease;
	}

	.indicator.active {
		background: var(--main-color);
		transform: scale(1.2);
	}

	.asset-info {
		text-align: center;
		margin-top: 1rem;
	}

	.asset-name {
		font-weight: 600;
		color: var(--text);
		font-size: 1rem;
		margin-bottom: 0.25rem;
	}

	.asset-amount-display {
		font-size: 1.1rem;
		font-weight: bold;
		color: var(--main-color);
		margin-bottom: 0.25rem;
	}

	.total-assets {
		font-size: 0.8rem;
		color: var(--text-light);
		opacity: 0.8;
	}

	.no-assets {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-light);
	}

	.no-assets-icon {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		opacity: 0.5;
	}

	.no-assets-text {
		font-size: 1rem;
		opacity: 0.7;
	}

	/* Card Header */
	.card-header {
		padding: 1rem 1.5rem 0.5rem;
	}

	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.state-badge {
		font-weight: bold;
		text-transform: uppercase;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		background: var(--forms-bg);
		border: 1px solid var(--borders);
	}

	.text-yellow-400 {
		color: var(--main-color);
		background: rgba(255, 193, 7, 0.1);
		border-color: var(--main-color);
	}

	.text-green-400 {
		color: #10b981;
		background: rgba(16, 185, 129, 0.1);
		border-color: #10b981;
	}

	.text-red-400 {
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
		border-color: #ef4444;
	}

	.text-gray-400 {
		color: #9ca3af;
		background: rgba(156, 163, 175, 0.1);
		border-color: #9ca3af;
	}

	.role-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.delegator-badge {
		background: var(--main-color);
		color: var(--background);
	}

	.delegate-badge {
		background: var(--info-color);
		color: var(--background);
	}

	/* Delegation Details */
	.delegation-details {
		padding: 0.5rem 1.5rem 1rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.detail-label {
		font-size: 0.8rem;
		color: var(--text-light);
		font-weight: 500;
	}

	.address-link {
		color: var(--info-color);
		text-decoration: none;
		font-family: monospace;
		font-size: 0.8rem;
		transition: color 0.2s ease;
		font-weight: 500;
	}

	.address-link:hover {
		text-decoration: underline;
		color: var(--main-color);
	}

	.your-address {
		color: var(--main-color);
		font-weight: bold;
	}

	.fee-amount {
		color: var(--main-color);
		font-weight: bold;
		font-size: 0.85rem;
	}

	.expiry-block {
		color: var(--text);
		font-weight: 600;
		font-family: monospace;
		font-size: 0.8rem;
	}

	.remaining-time {
		color: var(--text-light);
		font-weight: 500;
		font-size: 0.8rem;
	}

	/* Action Button */
	.card-actions {
		padding: 0 1.5rem 1.5rem;
	}

	.action-button {
		width: 100%;
		background: var(--main-color);
		color: var(--background);
		border: none;
		border-radius: 12px;
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.action-button:hover:not(:disabled) {
		background: var(--main-color-dark);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.action-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.card-status {
		padding: 0 1.5rem 1.5rem;
		text-align: center;
	}

	.status-text {
		color: var(--text-light);
		font-size: 0.85rem;
		font-style: italic;
	}

	.no-delegations {
		text-align: center;
		padding: 3rem 1rem;
		background-color: var(--footer);
		border: 1px solid var(--borders);
		border-radius: 16px;
		color: var(--text-light);
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.delegation-card {
			flex: 0 0 calc(100% - 0rem);
			min-width: 280px;
		}

		.asset-showcase {
			height: 180px;
		}

		.main-asset-image {
			width: 80px;
			height: 80px;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.delegation-card {
			flex: 0 0 calc(50% - 0.75rem);
			min-width: 300px;
		}
	}

	@media (min-width: 1025px) and (max-width: 1400px) {
		.delegation-card {
			flex: 0 0 calc(33.333% - 1rem);
			min-width: 300px;
		}
	}

	@media (min-width: 1401px) {
		.delegation-card {
			flex: 0 0 calc(25% - 1.125rem);
			min-width: 320px;
		}
	}
</style>
