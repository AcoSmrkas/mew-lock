<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo } from '$lib/store/store';
	import { nFormatter, showCustomToast } from '$lib/utils/utils.js';
	import { fade, fly } from 'svelte/transition';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import { get } from 'svelte/store';

	// MewLock variables
	let mewLockBoxes = [];
	let loading = true;
	let showLockModal = false;
	let withdrawing = false;
	let currentHeight = 0;
	let lockAmount = '';
	let lockDuration = 720; // Default 720 blocks (~12 hours)
	let unlockHeight = '';
	let selectedTokensToLock = [];
	let assets = [];
	let assetsLoading = false;
	let search = '';

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS = "5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU";

	onMount(async () => {
		await getCurrentBlockHeight();
		await loadMewLockBoxes();
	});

	// Convert public key to address using ErgoAddress
	function convertPkToAddress(pkRegister) {
		try {
			const serializedValue = pkRegister.serializedValue || pkRegister;
			// Remove '07' prefix if present (common in serialized public keys)
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

	async function getCurrentBlockHeight() {
		try {
			const response = await getBlockHeight();
			currentHeight = response;
			// Auto-update unlock height when current height is loaded
			if (lockDuration) {
				updateUnlockHeight();
			}
		} catch (error) {
			console.error('Error fetching current height:', error);
		}
	}

	async function loadMewLockBoxes() {
		loading = true;
		try {
			// Get current block height
			const currentHeightValue = await getCurrentBlockHeight();
			
			// Search for boxes at the MewLock contract address
			const response = await fetch(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`);
			const data = await response.json();
			
			mewLockBoxes = data.items.map(box => {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				const canWithdraw = currentHeight >= unlockHeight;
				const depositorPubKey = box.additionalRegisters.R4.renderedValue;
				const depositorAddress = convertPkToAddress(box.additionalRegisters.R4);
				const isOwnBox = depositorAddress === $connected_wallet_address;
				
				return {
					boxId: box.boxId,
					value: parseInt(box.value),
					assets: box.assets || [],
					unlockHeight,
					currentHeight,
					canWithdraw,
					depositorPubKey,
					depositorAddress,
					isOwnBox,
					ergoTree: box.ergoTree,
					additionalRegisters: box.additionalRegisters,
					blocksRemaining: Math.max(0, unlockHeight - currentHeight)
				};
			});

			// Sort by unlock height (earliest first)
			mewLockBoxes.sort((a, b) => a.unlockHeight - b.unlockHeight);
			
		} catch (error) {
			console.error('Error loading MewLock boxes:', error);
		}
		loading = false;
	}

	async function handleWithdrawal(lockBox) {
		if (!lockBox.canWithdraw) {
			showCustomToast('This token is not ready for withdrawal yet.', 3000, 'warning');
			return;
		}

		if (!lockBox.isOwnBox) {
			showCustomToast('You can only withdraw your own locked tokens.', 3000, 'warning');
			return;
		}

		if (withdrawing) {
			return; // Prevent multiple simultaneous withdrawals
		}

		withdrawing = true;

		try {
			// Import wallet store and utility functions
			const { connected_wallet_address, selected_wallet_ergo } = await import('$lib/store/store');
			const { fetchBoxes } = await import('$lib/api-explorer/explorer.ts');
			const { getBlockHeight } = await import('$lib/api-explorer/explorer.ts');
			const { createMewLockWithdrawalTx } = await import('$lib/contract/mewLockTx.ts');
			const { get } = await import('svelte/store');

			let myAddress, height, utxos;

			// Get wallet information
			if (get(selected_wallet_ergo) !== 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await getBlockHeight();
			}

			// Create the withdrawal transaction
			const withdrawalTx = await createMewLockWithdrawalTx(
				myAddress,
				utxos,
				height,
				lockBox
			);

			// Sign and submit the transaction
			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(withdrawalTx);
				const transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Tokens withdrawn successfully!<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);
				
				// Refresh the MewLock boxes
				await loadMewLockBoxes();
			} else {
				// Handle Ergopay case
				console.log('Ergopay withdrawal not implemented yet');
				showCustomToast('Ergopay withdrawal not implemented yet', 3000, 'warning');
			}

		} catch (error) {
			console.error('Error during withdrawal:', error);
			showCustomToast(`Error during withdrawal: ${error.message}`, 5000, 'danger');
		} finally {
			withdrawing = false;
		}
	}

	function openLockModal() {
		if (!$connected_wallet_address) {
			showCustomToast('Please connect your wallet first.', 3000, 'info');
			return;
		}
		showLockModal = true;
	}

	function closeLockModal() {
		showLockModal = false;
		lockAmount = '';
		lockDuration = 720;
		unlockHeight = '';
		selectedTokensToLock = [];
	}

	async function updateUnlockHeight() {
		if (lockDuration && currentHeight) {
			unlockHeight = (currentHeight + parseInt(lockDuration)).toString();
		}
	}

	async function lockTokens() {
		if (!$connected_wallet_address) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}
		if (!lockAmount || lockAmount <= 0) {
			showCustomToast('Enter a valid amount to lock.', 1500, 'info');
			return;
		}
		if (selectedTokensToLock.length > 0 && parseFloat(lockAmount) < 0.1) {
			showCustomToast('Minimum 0.1 ERG required when locking tokens to prevent storage rent.', 3000, 'warning');
			return;
		}
		if (!unlockHeight || unlockHeight <= 0) {
			showCustomToast('Enter a valid unlock height.', 1500, 'info');
			return;
		}

		try {
			let myAddress, height, utxos;

			if ($selected_wallet_ergo != 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes($connected_wallet_address);
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes($connected_wallet_address);
				height = await getBlockHeight();
			}

			// Use the unlockHeight directly from the input
			const unlockHeightValue = parseInt(unlockHeight);

			// Convert ERG to nanoERG
			const amountToLock = BigInt(Math.round(parseFloat(lockAmount) * 1e9));

			// Prepare tokens to lock
			const tokensToLock = selectedTokensToLock.map(token => ({
				tokenId: token.tokenId,
				amount: token.amount.toString()
			}));

			// Import and use MewLock deposit transaction
			const { createMewLockDepositTx } = await import('$lib/contract/mewLockTx.ts');
			const lockTx = await createMewLockDepositTx(
				myAddress,
				utxos,
				height,
				amountToLock,
				tokensToLock,
				unlockHeightValue
			);

			if ($selected_wallet_ergo != 'ergopay') {
				const signed = await ergo.sign_tx(lockTx);
				const transactionId = await ergo.submit_tx(signed);

				const assetText = selectedTokensToLock.length > 0 ? 
					`ERG and ${selectedTokensToLock.length} token(s)` : 'ERG';

				showCustomToast(
					`${assetText} locked successfully! They will unlock at block ${unlockHeightValue}.<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Close modal and refresh
				closeLockModal();
				await loadMewLockBoxes();
			} else {
				showCustomToast('Ergopay not implemented yet', 3000, 'warning');
			}
		} catch (e) {
			console.error(e);
			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
			} else {
				showCustomToast(`Failed to lock tokens.`, 5000, 'danger');
			}
		}
	}

	$: if (lockDuration && currentHeight) {
		updateUnlockHeight();
	}
</script>

<svelte:head>
	<title>MewLock - Time-Locked Storage | Secure Your Tokens</title>
	<meta name="description" content="Secure your tokens with time-based smart contracts. MewLock provides decentralized time-locked storage on Ergo blockchain." />
</svelte:head>

<!-- Modern Compact Navigation -->
<nav class="fixed top-0 w-full z-50 bg-background/95 backdrop-blur-md border-b border-borders">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16">
			<!-- Logo -->
			<div class="flex items-center">
				<div class="flex-shrink-0">
					<h1 class="text-2xl font-bold bg-gradient-to-r from-main-color to-info-color bg-clip-text text-transparent">
						🔒 MewLock
					</h1>
				</div>
			</div>

			<!-- Wallet Connection -->
			<div class="flex items-center space-x-4">
				{#if $connected_wallet_address}
					<div class="bg-forms-bg px-3 py-1 rounded-lg text-sm">
						<span class="text-text-light">Connected:</span>
						<span class="text-main-color font-mono">
							{$connected_wallet_address.substring(0, 6)}...{$connected_wallet_address.substring($connected_wallet_address.length - 6)}
						</span>
					</div>
				{:else}
					<button class="btn btn-primary text-sm px-4 py-2">
						Connect Wallet
					</button>
				{/if}
			</div>
		</div>
	</div>
</nav>

<!-- Main Content -->
<main class="pt-20 min-h-screen bg-background">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		
		<!-- Hero Section -->
		<div class="text-center mb-12">
			<h1 class="text-5xl font-bold text-white mb-4">
				Time-Locked <span class="bg-gradient-to-r from-main-color to-info-color bg-clip-text text-transparent">Storage</span>
			</h1>
			<p class="text-xl text-text-light max-w-3xl mx-auto mb-8">
				Secure your ERG and tokens with smart contracts. Set custom unlock heights and protect your assets with decentralized time-locks.
			</p>
			
			<!-- Stats Cards -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-4xl mx-auto">
				<div class="bg-forms-bg border border-borders rounded-xl p-6">
					<div class="text-3xl font-bold text-main-color mb-2">{mewLockBoxes.length}</div>
					<div class="text-text-light">Total Locks</div>
				</div>
				<div class="bg-forms-bg border border-borders rounded-xl p-6">
					<div class="text-3xl font-bold text-info-color mb-2">{currentHeight}</div>
					<div class="text-text-light">Current Height</div>
				</div>
				<div class="bg-forms-bg border border-borders rounded-xl p-6">
					<div class="text-3xl font-bold text-secondary-color mb-2">3%</div>
					<div class="text-text-light">Fee</div>
				</div>
			</div>

			<!-- Action Button -->
			<button 
				class="btn btn-primary btn-big px-8 py-4 text-lg font-semibold rounded-xl hover:scale-105 transition-all duration-200"
				on:click={openLockModal}
			>
				<i class="fa-solid fa-lock mr-2"></i>
				Lock Your Tokens
			</button>
		</div>

		<!-- Locked Tokens Section -->
		<div class="mb-12">
			<div class="flex items-center justify-between mb-8">
				<h2 class="text-3xl font-bold text-white">Your Locked Tokens</h2>
				<button 
					class="btn btn-secondary px-4 py-2 rounded-lg"
					on:click={loadMewLockBoxes}
				>
					<i class="fa-solid fa-refresh mr-2"></i>
					Refresh
				</button>
			</div>

			{#if loading}
				<div class="flex items-center justify-center py-16">
					<div class="loading-spinner w-10 h-10 border-4 border-borders border-t-main-color rounded-full animate-spin"></div>
					<span class="ml-4 text-text-light">Loading locked tokens...</span>
				</div>
			{:else if mewLockBoxes.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each mewLockBoxes as lockBox, index}
						<div 
							class="bg-forms-bg border border-borders rounded-xl p-6 hover:border-main-color/50 transition-all duration-300"
							class:border-main-color={lockBox.canWithdraw && lockBox.isOwnBox}
							class:border-info-color={!lockBox.isOwnBox}
							in:fly={{ y: 20, duration: 300, delay: index * 100 }}
						>
							<!-- Header -->
							<div class="flex items-center justify-between mb-4">
								<div class="flex items-center space-x-2">
									<div class="w-3 h-3 rounded-full" 
										 class:bg-green-500={lockBox.canWithdraw}
										 class:bg-red-500={!lockBox.canWithdraw}></div>
									<span class="text-sm font-medium"
										  class:text-green-400={lockBox.canWithdraw}
										  class:text-red-400={!lockBox.canWithdraw}>
										{lockBox.canWithdraw ? 'Unlocked' : 'Locked'}
									</span>
								</div>
								{#if lockBox.isOwnBox}
									<span class="px-2 py-1 bg-main-color/20 text-main-color text-xs font-medium rounded-full">
										Your Lock
									</span>
								{/if}
							</div>

							<!-- Amount -->
							<div class="mb-4">
								<div class="text-2xl font-bold text-white mb-1">
									{nFormatter(lockBox.value / 1e9)} ERG
								</div>
								{#if lockBox.assets && lockBox.assets.length > 0}
									<div class="text-sm text-info-color">
										+ {lockBox.assets.length} token{lockBox.assets.length > 1 ? 's' : ''}
									</div>
								{/if}
							</div>

							<!-- Lock Info -->
							<div class="space-y-2 mb-6 text-sm">
								<div class="flex justify-between">
									<span class="text-text-light">Unlock Height:</span>
									<span class="text-white font-mono">{lockBox.unlockHeight}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-text-light">Owner:</span>
									<a 
										href="https://ergexplorer.com/addresses/{lockBox.depositorAddress}" 
										target="_blank" 
										class="text-main-color hover:text-info-color font-mono text-xs"
									>
										{lockBox.depositorAddress.substring(0, 8)}...
									</a>
								</div>
								{#if !lockBox.canWithdraw}
									<div class="flex justify-between">
										<span class="text-text-light">Blocks Left:</span>
										<span class="text-red-400 font-semibold">{lockBox.blocksRemaining}</span>
									</div>
								{/if}
							</div>

							<!-- Action Button -->
							{#if lockBox.isOwnBox && lockBox.canWithdraw}
								<button 
									class="w-full btn btn-primary py-3 rounded-lg font-semibold hover:scale-105 transition-all duration-200"
									disabled={withdrawing}
									on:click={() => handleWithdrawal(lockBox)}
								>
									{#if withdrawing}
										<div class="btn-spinner mr-2"></div>
										Processing...
									{:else}
										<i class="fa-solid fa-unlock mr-2"></i>
										Withdraw {nFormatter(lockBox.value / 1e9)} ERG
										{#if lockBox.assets && lockBox.assets.length > 0}
											+ {lockBox.assets.length} token{lockBox.assets.length > 1 ? 's' : ''}
										{/if}
									{/if}
								</button>
							{:else if !lockBox.canWithdraw}
								<button class="w-full btn btn-secondary opacity-50 cursor-not-allowed py-3 rounded-lg" disabled>
									<i class="fa-solid fa-clock mr-2"></i>
									Locked for {lockBox.blocksRemaining} blocks
								</button>
							{:else}
								<button class="w-full btn btn-secondary opacity-50 cursor-not-allowed py-3 rounded-lg" disabled>
									<i class="fa-solid fa-user-slash mr-2"></i>
									Not Your Lock
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-16">
					<div class="text-6xl text-borders mb-4">🔒</div>
					<h3 class="text-2xl font-bold text-white mb-2">No Locked Tokens</h3>
					<p class="text-text-light mb-6">Start by locking your first tokens with MewLock</p>
					<button 
						class="btn btn-primary px-6 py-3 rounded-lg"
						on:click={openLockModal}
					>
						Lock Your First Tokens
					</button>
				</div>
			{/if}
		</div>
	</div>
</main>

<!-- Lock Modal -->
{#if showLockModal}
	<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" transition:fade>
		<div class="bg-forms-bg border border-borders rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" transition:fly={{ y: 20 }}>
			<div class="p-6">
				<!-- Modal Header -->
				<div class="flex items-center justify-between mb-6">
					<h2 class="text-2xl font-bold text-white">Lock Your Tokens</h2>
					<button 
						class="text-text-light hover:text-white transition-colors"
						on:click={closeLockModal}
					>
						<i class="fa-solid fa-times text-xl"></i>
					</button>
				</div>

				<!-- Lock Form -->
				<div class="space-y-6">
					<!-- Amount and Height -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label class="block text-text-light font-semibold mb-2">Amount to Lock (ERG)</label>
							<input 
								class="form-control w-full"
								type="number" 
								bind:value={lockAmount} 
								min="0.1" 
								step="0.1"
								placeholder="10.0"
							/>
							{#if selectedTokensToLock.length > 0}
								<small class="text-main-color">Minimum 0.1 ERG required when locking tokens</small>
							{/if}
						</div>
						<div>
							<label class="block text-text-light font-semibold mb-2">Unlock Height</label>
							<input 
								class="form-control w-full"
								type="number" 
								bind:value={unlockHeight} 
								min="1" 
								step="1"
								placeholder={`e.g., ${currentHeight + 720}`}
							/>
							<small class="text-text-light">Block height when tokens unlock</small>
						</div>
					</div>

					<!-- Duration Helper -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label class="block text-text-light font-semibold mb-2">Lock Duration (blocks)</label>
							<input 
								class="form-control w-full"
								type="number" 
								bind:value={lockDuration} 
								min="60" 
								step="60"
								placeholder="720"
								on:input={updateUnlockHeight}
							/>
							<small class="text-text-light">~{Math.round(lockDuration/60)} hours from now</small>
						</div>
						<div>
							<label class="block text-text-light font-semibold mb-2">Current Height</label>
							<div class="form-control bg-footer text-text-light cursor-not-allowed">
								{currentHeight || 'Loading...'}
							</div>
							<small class="text-text-light">Current blockchain height</small>
						</div>
					</div>

					<!-- Contract Info -->
					<div class="bg-footer border border-borders rounded-lg p-4">
						<h4 class="text-white font-bold mb-3">🔒 MewLock Smart Contract</h4>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
							<div class="text-text-light"><strong>ERG Amount:</strong> {lockAmount || '0'} ERG</div>
							<div class="text-text-light"><strong>Additional Tokens:</strong> {selectedTokensToLock.length} selected</div>
							<div class="text-text-light"><strong>R4 (depositorPubKey):</strong> Your public key</div>
							<div class="text-text-light"><strong>R5 (unlockHeight):</strong> {unlockHeight || 'Not set'}</div>
						</div>
						{#if unlockHeight && currentHeight}
							<div class="text-main-color mt-2"><strong>⏰ Blocks to unlock:</strong> {Math.max(0, parseInt(unlockHeight) - currentHeight)}</div>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				<div class="flex space-x-4 mt-8">
					<button 
						class="flex-1 btn btn-secondary py-3 rounded-lg"
						on:click={closeLockModal}
					>
						Cancel
					</button>
					<button 
						class="flex-1 btn btn-primary py-3 rounded-lg font-semibold"
						disabled={!lockAmount || lockAmount <= 0 || !unlockHeight || unlockHeight <= 0}
						on:click={lockTokens}
					>
						<i class="fa-solid fa-lock mr-2"></i>
						Lock Tokens
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Compact Footer -->
<footer class="bg-footer border-t border-borders mt-16">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			<!-- Brand -->
			<div>
				<h3 class="text-xl font-bold bg-gradient-to-r from-main-color to-info-color bg-clip-text text-transparent mb-3">
					🔒 MewLock
				</h3>
				<p class="text-text-light text-sm">
					Secure time-locked storage for your ERG and tokens on the Ergo blockchain.
				</p>
			</div>
			
			<!-- Links -->
			<div>
				<h4 class="font-semibold text-white mb-3">Resources</h4>
				<ul class="space-y-2 text-sm">
					<li><a href="#" class="text-text-light hover:text-main-color transition-colors">Documentation</a></li>
					<li><a href="#" class="text-text-light hover:text-main-color transition-colors">Smart Contract</a></li>
					<li><a href="#" class="text-text-light hover:text-main-color transition-colors">Explorer</a></li>
				</ul>
			</div>
			
			<!-- Social -->
			<div>
				<h4 class="font-semibold text-white mb-3">Community</h4>
				<div class="flex space-x-4">
					<a href="https://t.me/MewFinance" target="_blank" class="text-text-light hover:text-main-color transition-colors">
						<i class="fab fa-telegram text-xl"></i>
					</a>
					<a href="https://x.com/Mew_finance" target="_blank" class="text-text-light hover:text-main-color transition-colors">
						<i class="fab fa-twitter text-xl"></i>
					</a>
				</div>
			</div>
		</div>
		
		<div class="border-t border-borders mt-8 pt-6 text-center">
			<p class="text-text-light text-sm">
				© {new Date().getFullYear()} MewLock. Built on Ergo blockchain.
			</p>
		</div>
	</div>
</footer>

<style>
	/* Custom CSS using the existing color variables */
	:root {
		--main-color: #f9d72d;
		--secondary-color: #fff;
		--info-color: #04dfff;
		--background: #160d25;
		--forms-bg: #271843;
		--borders: #ffffff22;
		--text-light: #ffffff77;
		--footer: #0e0917;
	}

	.bg-background { background-color: var(--background); }
	.bg-forms-bg { background-color: var(--forms-bg); }
	.bg-footer { background-color: var(--footer); }
	.border-borders { border-color: var(--borders); }
	.text-main-color { color: var(--main-color); }
	.text-info-color { color: var(--info-color); }
	.text-secondary-color { color: var(--secondary-color); }
	.text-text-light { color: var(--text-light); }

	.loading-spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.btn {
		border-radius: 12px !important;
		font-size: 0.9em !important;
		font-weight: bold !important;
		text-transform: unset !important;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background-color: var(--main-color) !important;
		color: var(--background) !important;
		border: none;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: var(--info-color) !important;
		transform: translateY(-1px);
	}

	.btn-secondary {
		background-color: var(--secondary-color) !important;
		color: var(--background) !important;
		border: none;
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: var(--info-color) !important;
	}

	.btn-big {
		padding: 15px 30px !important;
	}

	.form-control {
		background: var(--footer) !important;
		border-radius: 8px;
		color: #ffffff;
		padding: 0.75rem;
		font-size: 1rem;
		width: 100%;
		border: 1px solid var(--borders) !important;
	}

	.form-control:focus {
		outline: none;
		box-shadow: none;
		border: 1px solid var(--main-color) !important;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 1s linear infinite;
		display: inline-block;
	}
</style>