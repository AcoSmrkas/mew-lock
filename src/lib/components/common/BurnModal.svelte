<script lang="ts">
	import { get } from 'svelte/store';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		utxos
	} from '$lib/store/store';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer';
	import { ERG_BURN_FEE } from '$lib/common/const';
	import {
		nFormatter,
		showCustomToast,
		getImageUrl,
		setPlaceholderImage,
		isWalletConected,
		hidePleaseWait,
		showPleaseWait
	} from '$lib/utils/utils';
	import { burnTx } from '$lib/contract/burnTx';
	import ErgopayModal from './ErgopayModal.svelte';

	export let showModal = false;
	export let onSuccess: () => void = () => {};
	export let preselectedTokenId: string | null = null;

	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let additionalAssets: Array<any> = [];
	let additionalAssetsFiltered: Array<any> = [];
	let selectedAssets: Array<any> = [];
	let assets: Array<any> = [];
	let search = '';
	let loading = false;

	$: if (showModal && $selected_wallet_ergo) {
		loadWalletBoxes();
	}

	$: filterAssets(search);

	// Auto-select preselected token when assets are loaded
	$: if (preselectedTokenId && additionalAssets.length > 0) {
		const tokenToSelect = additionalAssets.find(t => t.tokenId === preselectedTokenId);
		if (tokenToSelect && !selectedAssets.some(s => s.tokenId === preselectedTokenId)) {
			selectToken(tokenToSelect);
			preselectedTokenId = null; // Reset after selecting
		}
	}

	function filterAssets(search: string) {
		search = search.toLowerCase();

		additionalAssetsFiltered = additionalAssets.filter((asset) => {
			if (asset.name) {
				return asset.name.toLowerCase().includes(search);
			} else {
				return asset.tokenId.includes(search);
			}
		});
	}

	async function loadWalletBoxes() {
		if (loading) return;
		loading = true;

		additionalAssets = [];
		additionalAssetsFiltered = [];
		selectedAssets = [];

		try {
			if ($selected_wallet_ergo) {
				let boxes = null;

				if ($selected_wallet_ergo != 'ergopay') {
					boxes = await fetchBoxes($connected_wallet_address);
				} else {
					boxes = await fetchBoxes($connected_wallet_address);
				}

				utxos.set(JSON.parse(JSON.stringify(boxes)));
				assets = boxes
					.flatMap((b: any) =>
						b.assets.map((t: any) => {
							t.amount = BigInt(t.amount);
							return t;
						})
					)
					.reduce(sumTokens, []);

				const ids = assets.map((asset: any) => asset.tokenId);
				const tokenInfos = (
					await (
						await fetch('https://api.ergexplorer.com/tokens/byId', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({ ids: ids })
						})
					).json()
				).items;

				for (const asset of assets) {
					const tokenInfo = tokenInfos.find((info: any) => info.id === asset.tokenId);
					if (tokenInfo) {
						asset.name = tokenInfo.name;
						asset.decimals = tokenInfo.decimals;
						asset.displayAmount = Number(asset.amount) / Math.pow(10, asset.decimals);
						asset.cachedurl = tokenInfo.cachedurl;
						asset.tokenicon = tokenInfo.cachedurl;
					}
				}

				additionalAssets = assets.filter(
					(a: any) => !selectedAssets.some((sa: any) => sa.tokenId == a.tokenId)
				);

				filterAssets(search);
			}
		} finally {
			loading = false;
		}
	}

	function sumTokens(acc: any[], e: any) {
		if (acc.some((t) => t.tokenId == e.tokenId)) {
			acc.find((t) => t.tokenId == e.tokenId).amount += e.amount;
			return acc;
		} else {
			return [...acc, e];
		}
	}

	function selectToken(token: any) {
		additionalAssets = additionalAssets.filter((t) => t.tokenId != token.tokenId);
		selectedAssets = [...selectedAssets, Object.assign({}, token)];
		filterAssets(search);
	}

	function removeToken(token: any) {
		additionalAssets = [assets.find((a: any) => a.tokenId == token.tokenId), ...additionalAssets];
		selectedAssets = selectedAssets.filter((t) => t.tokenId != token.tokenId);
		filterAssets(search);
	}

	function updateTokenAmount(token: any, displayAmount: number) {
		token.displayAmount = displayAmount;
		token.amount = BigInt(Math.round(displayAmount * Math.pow(10, token.decimals)));
	}

	async function burn() {
		if (!isWalletConected()) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}

		if (selectedAssets.length < 1) {
			showCustomToast('Add Tokens.', 1500, 'info');
			return;
		}

		showPleaseWait();

		let myAddress, height;
		unsignedTx = null;

		if ($selected_wallet_ergo != 'ergopay') {
			myAddress = await ergo.get_change_address();
			height = await ergo.get_current_height();
		} else {
			myAddress = get(connected_wallet_address);
			height = await getBlockHeight();
		}

		let unsigned;
		try {
			unsigned = burnTx(myAddress, $utxos, height, selectedAssets);
		} catch (e: any) {
			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
				hidePleaseWait();
				return;
			}

			console.error(e);
			showCustomToast(`Failed to submit TX.`, 5000, 'danger');
			hidePleaseWait();
			return;
		}

		let transactionId, signed;
		if ($selected_wallet_ergo != 'ergopay') {
			try {
				signed = await ergo.sign_tx(unsigned);
				transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Tokens burned successfully! TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					0,
					'success'
				);

				// Reset and close
				selectedAssets = [];
				additionalAssets = [];
				showModal = false;

				// Call success callback
				onSuccess();
			} catch (e: any) {
				if (e.info && e.info == 'User rejected.') {
					hidePleaseWait();
					return;
				}

				console.error(e);
				showCustomToast(`Failed to submit TX.`, 5000, 'danger');
			}
		} else {
			unsignedTx = unsigned;
			isAuth = false;
			showErgopayModal = true;
		}

		hidePleaseWait();
	}

	function closeModal() {
		showModal = false;
		selectedAssets = [];
		additionalAssets = [];
		search = '';
	}

	const scrollToTop = () => {
		const modalContent = document.querySelector('.additional-assets');
		if (modalContent) {
			modalContent.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		}
	};
</script>

{#if showModal}
	<div class="modal-overlay" on:click={closeModal}>
		<div class="modal-container" on:click|stopPropagation>
			<div class="modal-header">
				<h2>🔥 Burn Tokens</h2>
				<button class="close-btn" on:click={closeModal}>×</button>
			</div>

			<div class="modal-body">
				{#if !$selected_wallet_ergo}
					<div class="connect-wallet-message">
						<p>Please connect a wallet to burn tokens.</p>
					</div>
				{:else if loading}
					<div class="loading-message">
						<div class="spinner"></div>
						<p>Loading your tokens...</p>
					</div>
				{:else}
					<div class="burn-form">
						<div class="section">
							<h3>Selected Assets</h3>
							{#if selectedAssets.length == 0}
								<p class="empty-message">No assets selected.</p>
							{:else}
								<div class="selected-assets">
									{#each selectedAssets as token}
										<div class="token-card">
											<img
												src={getImageUrl(token)}
												alt={token.name}
												class="token-image"
												on:error={(event) => setPlaceholderImage(event, token)}
											/>
											<div class="token-name">{token.name}</div>
											<input
												class="token-amount-input"
												type="number"
												min="0"
												step={1 / Math.pow(10, token.decimals)}
												bind:value={token.displayAmount}
												on:input={() => updateTokenAmount(token, token.displayAmount)}
											/>
											<button class="btn btn-danger" on:click={() => removeToken(token)}>
												Remove
											</button>
										</div>
									{/each}
								</div>
								<div class="fee-info">
									Estimated fee: <strong>{nFormatter(ERG_BURN_FEE / 10 ** 9)} ERG</strong>
								</div>
								<button on:click={burn} class="btn btn-burn">Burn Tokens 🔥</button>
							{/if}
						</div>

						<div class="section">
							<h3>Your Assets</h3>
							<input
								bind:value={search}
								class="search-input"
								type="text"
								placeholder="Search by asset name..."
							/>
							<div class="additional-assets">
								{#each additionalAssetsFiltered as token}
									<button class="token-card clickable" on:click={() => selectToken(token)}>
										<img
											src={getImageUrl(token)}
											alt={token.name}
											class="token-image"
											on:error={(event) => setPlaceholderImage(event, token)}
										/>
										<div class="token-name">{token.name}</div>
										<div class="token-amount">
											{nFormatter(token.displayAmount)}
										</div>
									</button>
								{/each}
								{#if additionalAssetsFiltered.length > 12}
									<button class="scroll-top-button" on:click={scrollToTop}>▲</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-container {
		background: rgba(22, 13, 37, 0.95);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 20px;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(255, 107, 107, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 2rem;
		border-bottom: 1px solid rgba(255, 107, 107, 0.2);
		background: rgba(255, 107, 107, 0.05);
	}

	.modal-header h2 {
		font-size: 1.8rem;
		font-weight: 700;
		color: #ff6b6b;
		margin: 0;
	}

	.close-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: rgba(255, 107, 107, 0.2);
		transform: scale(1.1);
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
	}

	.connect-wallet-message,
	.loading-message {
		text-align: center;
		padding: 3rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(255, 107, 107, 0.2);
		border-top: 4px solid #ff6b6b;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.burn-form {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.section {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.section h3 {
		font-size: 1.3rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem 0;
	}

	.empty-message {
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		padding: 2rem;
	}

	.selected-assets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.token-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.3s ease;
	}

	.token-card.clickable {
		cursor: pointer;
	}

	.token-card.clickable:hover {
		background: rgba(255, 107, 107, 0.1);
		border-color: rgba(255, 107, 107, 0.3);
		transform: translateY(-4px);
		box-shadow: 0 8px 20px rgba(255, 107, 107, 0.2);
	}

	.token-image {
		width: 60px;
		height: 60px;
		object-fit: contain;
		margin-bottom: 0.5rem;
	}

	.token-name {
		color: white;
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
		text-align: center;
		word-break: break-word;
	}

	.token-amount-input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		padding: 0.5rem;
		width: 100%;
		text-align: center;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
	}

	.token-amount-input:focus {
		outline: none;
		border-color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
	}

	.token-amount {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.85rem;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		margin-bottom: 1rem;
		font-size: 0.95rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.additional-assets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
		max-height: 400px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.additional-assets::-webkit-scrollbar {
		width: 8px;
	}

	.additional-assets::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
	}

	.additional-assets::-webkit-scrollbar-thumb {
		background: rgba(255, 107, 107, 0.3);
		border-radius: 4px;
	}

	.additional-assets::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 107, 107, 0.5);
	}

	.scroll-top-button {
		grid-column: -1;
		background: rgba(255, 107, 107, 0.2);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 8px;
		color: #ff6b6b;
		padding: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		min-height: 100px;
	}

	.scroll-top-button:hover {
		background: rgba(255, 107, 107, 0.3);
		transform: translateY(-2px);
	}

	.fee-info {
		color: rgba(255, 255, 255, 0.8);
		padding: 1rem;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 8px;
		margin-bottom: 1rem;
		text-align: center;
	}

	.fee-info strong {
		color: #ff6b6b;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
		width: 100%;
	}

	.btn-danger {
		background: rgba(239, 68, 68, 0.2);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.btn-danger:hover {
		background: rgba(239, 68, 68, 0.3);
		transform: translateY(-2px);
	}

	.btn-burn {
		background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
		color: white;
		font-size: 1.1rem;
		padding: 1rem 2rem;
		box-shadow: 0 8px 20px rgba(255, 107, 107, 0.3);
	}

	.btn-burn:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 30px rgba(255, 107, 107, 0.4);
	}

	@media (max-width: 768px) {
		.modal-container {
			max-width: 100%;
			max-height: 95vh;
		}

		.modal-header {
			padding: 1rem 1.5rem;
		}

		.modal-header h2 {
			font-size: 1.5rem;
		}

		.modal-body {
			padding: 1rem;
		}

		.selected-assets,
		.additional-assets {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
