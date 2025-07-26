<script lang="ts">
	import { nFormatter, getImageUrl, setPlaceholderImage } from '$lib/utils/utils.js';
	import { showNsfw } from '$lib/store/store.ts';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { connected_wallet_address } from '$lib/store/store.ts';

	export let lockBox;
	export let currentHeight = 0;
	export let onWithdraw = null;
	export let withdrawing = false;

	// Convert public key to address
	function convertPkToAddress(pkRegister) {
		try {
			const publicKeyHex = pkRegister.renderedValue || pkRegister.serializedValue || pkRegister;
			const publicKey = publicKeyHex.startsWith('07') ? publicKeyHex.substring(2) : publicKeyHex;
			return ErgoAddress.fromPublicKey(publicKey).toString();
		} catch (error) {
			console.error('Address conversion error:', error, pkRegister);
			return 'Invalid Address';
		}
	}

	// Calculate derived properties with safety checks
	$: unlockHeight = lockBox?.additionalRegisters?.R5?.renderedValue
		? parseInt(lockBox.additionalRegisters.R5.renderedValue)
		: 0;
	$: canWithdraw = currentHeight >= unlockHeight;
	$: depositorAddress = lockBox?.additionalRegisters?.R4
		? convertPkToAddress(lockBox.additionalRegisters.R4)
		: 'Unknown';
	$: isOwnBox = depositorAddress === $connected_wallet_address;
	$: blocksRemaining = Math.max(0, unlockHeight - currentHeight);
	$: hasTokens = lockBox?.assets && lockBox.assets.length > 0;
	$: ergAmount = lockBox?.value ? lockBox.value / 1e9 : 0;

	// Get token image URL using the same logic as SellWidget
	function getTokenImageUrl(asset) {
		return getImageUrl(asset, $showNsfw);
	}

	function handleWithdraw() {
		if (onWithdraw && canWithdraw && isOwnBox) {
			onWithdraw(lockBox);
		}
	}
</script>

<div
	class="locked-asset-card"
	class:own-lock={isOwnBox}
	class:unlockable={canWithdraw && isOwnBox}
	class:has-tokens={hasTokens}
>
	<!-- Header -->
	<div class="card-header">
		<div class="asset-amount">
			<div class="erg-amount">
				<span class="amount-value">{nFormatter(ergAmount)}</span>
				<span class="amount-currency">ERG</span>
			</div>
			{#if hasTokens}
				<div class="token-count">
					+ {lockBox.assets.length} token{lockBox.assets.length > 1 ? 's' : ''}
				</div>
			{/if}
		</div>
		<div class="lock-status" class:ready={canWithdraw}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				{#if canWithdraw}
					<path
						d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
						fill="currentColor"
					/>
				{:else}
					<path
						d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
						fill="currentColor"
					/>
				{/if}
			</svg>
			{canWithdraw ? 'Unlocked' : 'Locked'}
		</div>
		{#if isOwnBox}
			<span class="own-badge">Your Lock</span>
		{/if}
	</div>

	<!-- Tokens Display -->
	{#if hasTokens}
		<div class="tokens-section">
			<div class="tokens-grid">
				{#each lockBox.assets as asset}
					<div class="token-item">
						<div class="token-image">
							<img
								src={getTokenImageUrl(asset)}
								alt={asset.name || 'Token'}
								onerror={(event) => setPlaceholderImage(event, asset)}
								loading="lazy"
							/>
						</div>
						<div class="token-info">
							<span class="token-name">{asset.name || 'Unknown Token'}</span>
							<span class="token-amount"
								>{nFormatter(asset.amount / Math.pow(10, asset.decimals))}</span
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Lock Details -->
	<div class="card-body">
		<div class="info-grid">
			<div class="info-item">
				<span class="info-label">Unlock Height</span>
				<span class="info-value">{unlockHeight}</span>
			</div>
			{#if !canWithdraw}
				<div class="info-item">
					<span class="info-label">Blocks Left</span>
					<span class="info-value highlight">{blocksRemaining}</span>
				</div>
			{/if}
			<div class="info-item">
				<span class="info-label">Owner</span>
				<span class="info-value address">
					{#if isOwnBox}
						<span class="own-text">You</span>
					{:else}
						<a
							href="https://ergexplorer.com/addresses/{depositorAddress}"
							target="_blank"
							class="address-link"
						>
							{depositorAddress.substring(0, 4)}...{depositorAddress.substring(
								depositorAddress.length - 4
							)}
						</a>
					{/if}
				</span>
			</div>
		</div>
	</div>

	<!-- Actions -->
	{#if isOwnBox}
		<div class="card-actions">
			{#if canWithdraw}
				<button class="withdraw-btn" disabled={withdrawing} on:click={handleWithdraw}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
					{withdrawing
						? 'Processing...'
						: `Withdraw ${hasTokens ? 'All Assets' : nFormatter(ergAmount) + ' ERG'}`}
				</button>
			{:else}
				<div class="locked-info">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M12,1A11,11 0 0,0 1,12A11,11 0 0,0 12,23A11,11 0 0,0 23,12A11,11 0 0,0 12,1M12,20C16.2,20 19.5,17.2 20,13.5V13.5C20,13.3 20,13.2 20,13H19L17.8,15.4C17.1,16.5 15.9,17.2 14.6,17.2C14.2,17.2 13.9,17.1 13.6,16.9C12.9,16.5 12.4,15.8 12.2,15H8V12H12.2C12.4,11.2 12.9,10.5 13.6,10.1C13.9,9.9 14.2,9.8 14.6,9.8C15.9,9.8 17.1,10.5 17.8,11.6L19,14H20C20,10.1 16.4,7 12,7C10.9,7 9.8,7.3 8.9,7.7L10.1,9.5C10.7,9.2 11.3,9 12,9C14.8,9 17,11.2 17,14S14.8,19 12,19C9.2,19 7,16.8 7,14C7,13.4 7.1,12.9 7.3,12.4L5.6,11.2C5.2,12.1 5,13.1 5,14.1C5,17.9 8.1,21 12,21V20Z"
							fill="currentColor"
						/>
					</svg>
					Unlocks in {blocksRemaining} blocks
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.locked-asset-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
	}

	.locked-asset-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
		border-color: rgba(102, 126, 234, 0.3);
	}

	.locked-asset-card.own-lock {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.05);
	}

	.locked-asset-card.unlockable {
		border-color: rgba(34, 197, 94, 0.5);
		background: rgba(34, 197, 94, 0.05);
		box-shadow: 0 0 30px rgba(34, 197, 94, 0.1);
	}

	.locked-asset-card.has-tokens {
		background: rgba(102, 126, 234, 0.08);
		border-color: rgba(102, 126, 234, 0.3);
	}

	/* Header */
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.asset-amount {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.erg-amount {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.amount-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
	}

	.amount-currency {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.token-count {
		font-size: 0.875rem;
		color: #667eea;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		background: rgba(102, 126, 234, 0.1);
		border-radius: 12px;
		width: fit-content;
	}

	.lock-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 20px;
		color: rgba(239, 68, 68, 0.9);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.lock-status.ready {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
	}

	.own-badge {
		background: #667eea;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Tokens Section */
	.tokens-section {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		border: 1px solid rgba(102, 126, 234, 0.2);
	}

	.tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.token-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		transition: all 0.3s ease;
	}

	.token-item:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-1px);
	}

	.token-image {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.3);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.token-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.token-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.token-name {
		font-weight: 600;
		color: white;
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.token-amount {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	/* Body */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-value {
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.info-value.highlight {
		color: #667eea;
	}

	.info-value.address {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
	}

	.own-text {
		color: #667eea;
		font-weight: 600;
	}

	.address-link {
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		transition: color 0.2s;
	}

	.address-link:hover {
		color: #667eea;
	}

	/* Actions */
	.card-actions {
		margin-top: 1rem;
	}

	.withdraw-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
		border: none;
		border-radius: 12px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		font-size: 0.875rem;
	}

	.withdraw-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(34, 197, 94, 0.3);
	}

	.withdraw-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.locked-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		font-weight: 500;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.locked-asset-card {
			padding: 1rem;
		}

		.card-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.tokens-grid {
			grid-template-columns: 1fr;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
