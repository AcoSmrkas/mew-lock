<script lang="ts">
	import { onMount } from 'svelte';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		connected_wallet_balance,
		utxosLoading,
		utxosAssets,
		utxosTokenInfos,
		fetchUtxos
	} from '$lib/store/store.ts';
	import {
		DELEGATE_CONTRACT_V3,
		DELEGATION_MIN_FEE_PERCENT,
		MAX_BUNDLE_ASSETS,
		ASSETS
	} from '$lib/common/const.ts';
	import { delegateV3Tx } from '$lib/contract/delegationV3Tx.ts';
	import {
		showCustomToast,
		getImageUrl,
		setPlaceholderImage,
		getCommonBoxIds,
		truncateAddress,
		sleep
	} from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight, updateTempBoxes } from '$lib/api-explorer/explorer.ts';
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import JSONbig from 'json-bigint-native';
	import BigNumber from 'bignumber.js';
	import Loading from './Loading.svelte';
	import { fade, fly } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	export let showWidget = false;
	export let triggerCreate = false;

	let processing = false;
	let assetsLoading = false;
	let imageUrls = [];
	let utxos = [];
	let assets = [];
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let search = '';
	let additionalAssets: Array<Token> = [];
	let additionalAssetsFiltered: Array<Token> = [];
	let selectedAssets: Array<Token> = [];
	let delegateAddress = '';
	let durationBlocks: number = 4320; // Default 30 days
	let feeInErg: number = 5; // Default 5 ERG
	let feeTokenId: string = ''; // Token ID for fee payment (empty = ERG)
	let minFeeBlocks: number = 100; // Default 100 blocks
	let supportedFeeTokens: Array<Token> = []; // Supported tokens for fee payment from ASSETS

	$: filterAssets(search);

	function filterAssets(search) {
		search = search.toLowerCase();

		additionalAssetsFiltered = additionalAssets.filter((asset) => {
			if (asset.name) {
				return asset.name.toLowerCase().includes(search);
			} else {
				return asset.tokenId.includes(search);
			}
		});
	}

	async function loadWalletBoxes(wallet, forceFresh = false) {
		assetsLoading = true;

		if (forceFresh) {
			await fetchUtxos(wallet);
		}

		let utxosReady = !get(utxosLoading);

		if (!utxosReady) {
			do {
				await sleep(100);
				utxosReady = !get(utxosLoading);
			} while (!utxosReady);
		}

		if ($selected_wallet_ergo) {
			assets = JSONbig.parse(JSONbig.stringify(get(utxosAssets)));
			const tokenInfos = get(utxosTokenInfos);

			for (const asset of assets) {
				const tokenInfo = tokenInfos.find((info) => info.id === asset.tokenId);

				if (tokenInfo) {
					asset.name = tokenInfo.name;
					asset.decimals = tokenInfo.decimals;
					asset.displayAmount = Number(asset.amount) / Math.pow(10, asset.decimals);
					asset.royaltypercent = tokenInfo.royaltypercent;
					asset.minValue = asset.decimals == 0 ? 1 : 1 / Math.pow(10, asset.decimals);
				}

				asset.imageLink = tokenInfo?.cachedurl;
				asset.nsfw = tokenInfo?.nsfw;
				asset.scam = tokenInfo?.scam;

				if (tokenInfo?.iconurl) {
					asset.imageLink = tokenInfo.iconurl;
				}
			}

			assets.unshift({
				tokenId: 'erg',
				name: 'ERG',
				decimals: 9,
				amount: $connected_wallet_balance,
				displayAmount: Number($connected_wallet_balance) / Math.pow(10, 9),
				minValue: 0.1,
				imageLink: 'https://ergexplorer.com/images/logo-new.png',
				royaltypercent: 0
			});

			additionalAssets = assets.filter(
				(a) => !selectedAssets.some((sa) => sa.tokenId == a.tokenId)
			);

			// Set supported fee tokens from ASSETS constants (same as SellWidget)
			supportedFeeTokens = [
				{
					tokenId: 'erg',
					name: 'ERG',
					decimals: 9,
					imageLink: 'https://ergexplorer.com/images/logo-new.png'
				},
				...ASSETS.map((asset) => ({
					tokenId: asset.tokenId || asset.tokenid,
					name: asset.name,
					decimals: asset.decimals,
					imageLink: asset.imageLink || asset.cachedurl
				}))
			];

			updateImageUrls();
			filterAssets(search);
			assetsLoading = false;
		}
	}

	function selectToken(token) {
		if (selectedAssets.length >= MAX_BUNDLE_ASSETS) {
			showCustomToast(`Max limit of ${MAX_BUNDLE_ASSETS} assets per delegation reached.`, 3000);
			return;
		}

		additionalAssets = additionalAssets.filter((t) => t.tokenId != token.tokenId);
		selectedAssets = [...selectedAssets, Object.assign({}, token)];

		filterAssets(search);
	}

	function removeToken(token) {
		additionalAssets = [assets.find((a) => a.tokenId == token.tokenId), ...additionalAssets];
		selectedAssets = selectedAssets.filter((t) => t.tokenId != token.tokenId);

		filterAssets(search);
	}

	function cleanUpWidget() {
		selectedAssets = [];
		delegateAddress = '';
		durationBlocks = 4320;
		feeInErg = 5;
		feeTokenId = '';
		minFeeBlocks = 100;
	}

	async function createDelegation() {
		if (
			!$selected_wallet_ergo ||
			($selected_wallet_ergo != 'ergopay' &&
				!window.ergoConnector[$selected_wallet_ergo]?.isConnected)
		) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}
		if (selectedAssets.length < 1) {
			showCustomToast('Add assets to delegate.', 1500, 'info');
			return;
		}
		if (delegateAddress.length != 51) {
			showCustomToast('Invalid delegate address.', 1500, 'info');
			return;
		}
		if (durationBlocks < 1) {
			showCustomToast('Duration must be at least 1 block.', 1500, 'info');
			return;
		}
		if (feeInErg <= 0) {
			showCustomToast('Fee must be greater than 0.', 1500, 'info');
			return;
		}

		processing = true;

		let myAddress, height;
		unsignedTx = null;

		if ($selected_wallet_ergo != 'ergopay') {
			myAddress = await ergo.get_change_address();
			utxos = await fetchBoxes($connected_wallet_address);
			height = await ergo.get_current_height();
		} else {
			myAddress = get(connected_wallet_address);
			utxos = await fetchBoxes($connected_wallet_address);
			height = await getBlockHeight();
		}

		// Convert fee amount based on token type
		let feeAmountConverted;
		if (feeTokenId) {
			// For token fees, find the token decimals and convert properly
			let tokenDecimals = 2; // Default for SigUSD/MEW

			const feeToken = supportedFeeTokens.find(
				(t) => t.tokenId === feeTokenId || (t.tokenId === feeTokenId && t.tokenId !== 'erg')
			);
			if (feeToken && feeToken.decimals !== undefined) {
				tokenDecimals = feeToken.decimals;
			}

			// Convert 1 MEW → 100 raw units (1 × 10^2)
			feeAmountConverted = new BigNumber(feeInErg).times(10 ** tokenDecimals);
		} else {
			// For ERG, convert to nanoERG (×10^9)
			feeAmountConverted = new BigNumber(feeInErg).times(10 ** 9);
		}

		let unsigned;

		try {
			unsigned = delegateV3Tx(
				myAddress,
				delegateAddress,
				utxos,
				height,
				selectedAssets.filter((a) => a.tokenId !== 'erg'),
				durationBlocks,
				BigInt(feeAmountConverted.toString()),
				feeTokenId,
				DELEGATION_MIN_FEE_PERCENT,
				minFeeBlocks
			);
		} catch (e) {
			console.error(e);

			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
			} else if (e.info && e.info == 'User rejected') {
				//
			} else {
				console.log(e);
				showCustomToast(`Failed to create delegation.`, 5000, 'danger');
			}

			processing = false;
			return;
		}

		let transactionId, signed;
		if ($selected_wallet_ergo != 'ergopay') {
			try {
				signed = await ergo.sign_tx(unsigned);
				transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Delegation created successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				const usedBoxIds = getCommonBoxIds(utxos, signed.inputs);
				const newOutputs = signed.outputs.filter((output) => output.ergoTree == utxos[0].ergoTree);

				updateTempBoxes(myAddress, usedBoxIds, newOutputs);

				cleanUpWidget();
				await loadWalletBoxes(myAddress, true);
			} catch (e) {
				console.error(e);
				showCustomToast(`Failed to submit delegation.`, 5000, 'danger');
			}
		} else {
			unsignedTx = unsigned;
			isAuth = false;
			showErgopayModal = true;
		}

		processing = false;
	}

	function updateTokenAmount(e, token, displayAmount) {
		token.displayAmount = displayAmount;
		setTokenAmount(token, displayAmount);
	}

	function tokenAmountValidate(e, token, displayAmount) {
		if (displayAmount < token.minValue) {
			displayAmount = token.minValue;
			e.target.value = displayAmount;

			showCustomToast(`Minimum amount for ${token.name} is ${displayAmount}`, 3000);

			token.displayAmount = displayAmount;
			setTokenAmount(token, displayAmount);
		}
	}

	function setTokenAmount(token, displayAmount) {
		token.amount = BigInt(Math.round(displayAmount * Math.pow(10, token.decimals)));
	}

	function updateImageUrls() {
		const allAssets = additionalAssets.concat(selectedAssets);

		imageUrls = allAssets.reduce((acc, asset) => {
			acc[asset.tokenId] = getImageUrl(asset, true);
			return acc;
		}, {});
	}

	onMount(() => {
		loadWalletBoxes($selected_wallet_ergo);
	});

	$: if (showWidget) {
		loadWalletBoxes($selected_wallet_ergo);
	}

	$: if (triggerCreate) {
		createDelegation();
		triggerCreate = false;
	}
</script>

<div class="delegation-widget">
	<p class="text-light text-sm mb-4">
		Create a delegation to allow another party to control your assets for a specified duration and
		fee.
	</p>

	{#if selectedAssets.length > 0}
		<div class="selected-assets-section mb-4">
			<p class="mb-2"><strong>Assets to delegate:</strong></p>
			<div class="selected-assets">
				{#each selectedAssets as token}
					<div class="flex flex-row rounded-[8px] gap-x-2 token-card w-100 p-2">
						<div class="h-full w-[85px] bg-black rounded-lg">
							<img
								src={imageUrls[token.tokenId]}
								alt={token.name}
								class="token-image object-contain rounded-lg"
								on:error={(event) => setPlaceholderImage(event, token)}
							/>
						</div>
						<div class="flex flex-col flex-grow min-w-0 space-y-3">
							<span class="token-name text-white">{token.name}</span>
							<input
								class="token-amount"
								type="number"
								min="0"
								step={1 / Math.pow(10, token.decimals)}
								bind:value={token.displayAmount}
								on:input={(e) => updateTokenAmount(e, token, token.displayAmount)}
								on:blur={(e) => tokenAmountValidate(e, token, token.displayAmount)}
							/>
						</div>
						<div>
							<button
								class="btn-remove btn btn-secondary p-2 px-3"
								on:click={() => removeToken(token)}>x</button
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="delegation-form bg-bg p-3 rounded-lg mb-4">
		<div class="form-group mb-3">
			<label class="pb-1 font-bold text-md ms-[3px]" for="delegateAddress">Delegate Address:</label>
			<input
				id="delegateAddress"
				class="form-control w-100 bg-form border-0 text-white focus-primary"
				type="text"
				placeholder="9f..."
				bind:value={delegateAddress}
			/>
		</div>

		<div class="flex flex-col sm:flex-row gap-4 mb-3">
			<div class="flex-1">
				<label class="pb-1 font-bold text-md ms-[3px]" for="duration">Duration (blocks):</label>
				<input
					id="duration"
					class="form-control w-100 bg-form border-0 text-white focus-primary"
					type="number"
					min="1"
					placeholder="4320"
					bind:value={durationBlocks}
				/>
				<small class="text-light">~{Math.round(durationBlocks / 144)} days</small>
			</div>

			<div class="flex-1">
				<label class="pb-1 font-bold text-md ms-[3px]" for="fee">Activation Fee:</label>
				<div class="fee-input-container">
					<input
						id="fee"
						class="form-control fee-amount bg-form border-0 text-white focus-primary"
						type="number"
						min="0.001"
						step="0.001"
						placeholder="5"
						bind:value={feeInErg}
					/>
					<select
						class="form-control fee-token bg-form border-0 text-white focus-primary"
						bind:value={feeTokenId}
					>
						{#each supportedFeeTokens as token}
							<option value={token.tokenId === 'erg' ? '' : token.tokenId}>{token.name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<div class="flex flex-col sm:flex-row gap-4 mb-3">
			<div class="flex-1">
				<label class="pb-1 font-bold text-md ms-[3px]" for="minFeeBlocks">Min Fee Blocks:</label>
				<input
					id="minFeeBlocks"
					class="form-control w-100 bg-form border-0 text-white focus-primary"
					type="number"
					min="1"
					placeholder="100"
					bind:value={minFeeBlocks}
				/>
				<small class="text-light">~{Math.round(minFeeBlocks / 144)} days minimum</small>
			</div>
			<div class="flex-1">
				<div class="fee-info bg-form p-3 rounded-lg">
					<p class="text-light text-sm mb-1"><strong>Fee Structure:</strong></p>
					<p class="text-light text-xs">
						• Developer: {DELEGATION_MIN_FEE_PERCENT / 100}% of activation fee
					</p>
					<p class="text-light text-xs">
						• Delegator: {100 - DELEGATION_MIN_FEE_PERCENT / 100}% of activation fee
					</p>
				</div>
			</div>
		</div>
	</div>

	<h6 class="text-white text-xl font-bold font-manrope text-center mt-3">Your Assets</h6>
	<div class="bg-bg p-3 rounded-xl flex flex-col space-y-3">
		<p>
			<b>Address:</b>
			<a href="https://ergexplorer.com/addresses/{$connected_wallet_address}" target="_new"
				>{truncateAddress($connected_wallet_address)}</a
			>
		</p>
		{#if !assetsLoading}
			<input
				bind:value={search}
				class="form-control w-100 bg-form border-0 text-white focus-primary"
				type="text"
				placeholder="Search by asset name..."
			/>
		{/if}
	</div>

	{#if assetsLoading}
		<div class="w-100 relative min-h-[150px] col-span-12 mt-12 bg-form">
			<Loading />
		</div>
	{:else if !assetsLoading && additionalAssetsFiltered.length > 0}
		<div class="additional-assets">
			{#each additionalAssetsFiltered as token, index}
				<div
					in:fly={{ y: -20, duration: 200, delay: index * 50 }}
					out:fade={{ duration: 150 }}
					class="flex flex-row rounded-[8px] gap-x-2 token-card w-100 p-2 cursor-pointer"
					on:click={() => selectToken(token)}
				>
					<div class="h-full min-w-[85px] w-[85px] flex-grow bg-black rounded-lg">
						<img
							src={imageUrls[token.tokenId]}
							alt={token.name}
							class="token-image object-contain rounded-lg"
							on:error={(event) => setPlaceholderImage(event, token)}
						/>
					</div>
					<div class="flex flex-col flex-grow min-w-0 space-y-3">
						<span class="token-name text-white">{token.name}</span>
						<input class="token-amount disabled" value={token.displayAmount} disabled />
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p>No assets found.</p>
	{/if}
</div>

{#if showErgopayModal}
	<ErgopayModal
		bind:showErgopayModal
		bind:isAuth
		bind:unsignedTx
		on:success={async () => {
			showCustomToast('Delegation created successfully via ErgoPay!', 5000, 'success');
			cleanUpWidget();
			await loadWalletBoxes($connected_wallet_address, true);
		}}
	>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.delegation-widget {
		padding: 1rem;
	}

	.selected-assets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
		gap: 1rem;
		max-height: 200px;
		overflow-y: auto;
		border-bottom: 1px solid #333;
		padding-bottom: 1rem;
	}

	.token-card {
		background-color: var(--footer);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.2s ease;
		box-sizing: border-box;
		place-content: space-between;
	}

	.token-card:hover {
		scale: 1.03;
	}

	.token-name {
		font-weight: bold;
		white-space: wrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-height: 50px;
		text-align: start;
	}

	.token-amount {
		background-color: var(--forms-bg);
		border: none;
		padding: 5px 0;
		border-radius: 5px;
		color: #ffffff;
		width: 100%;
		text-align: center;
	}

	.token-image {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		object-position: center;
		overflow: hidden;
		margin: 0 auto;
	}

	.additional-assets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.additional-assets .token-card {
		cursor: pointer;
	}

	.additional-assets .token-amount {
		font-size: 0.9rem;
		opacity: 0.8;
	}

	.delegation-form .form-group {
		margin-bottom: 1rem;
	}

	.delegation-actions {
		margin-top: 2rem;
	}

	.fee-input-container {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.fee-amount {
		flex: 2;
	}

	.fee-token {
		flex: 1;
		min-width: 100px;
	}
</style>
