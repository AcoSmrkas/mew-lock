import {
	utxos,
	utxosAssets,
	utxosTokenInfos,
	utxosLoading,
	offersMy,
	loadingOffers,
	connected_wallet_balance,
	mewTier,
	authorizedMerchant,
	merchantName,
	merchantSaleFee,
	bumpAddressGeneration,
	stopUtxosPolling
} from '$lib/store/store.js';
import { clearTempBoxes } from '$lib/api-explorer/explorer.js';

const MEW_TIER = 'mew_tier';

// Components own some user-scoped state locally (Profile order arrays,
// notification stores, page-level box lists). They register a clear callback
// here so resetUserScope() can wipe them too, without this module importing the
// components (which would create cycles).
const extraResets: Array<() => void> = [];

export function registerScopeReset(fn: () => void) {
	extraResets.push(fn);
}

// Single clear-then-fetch entry point. Called at the TOP of every connected
// address transition (handleAddressChange, disconnectErgoWallet) BEFORE the new
// address is set, so the UI never shows a previous account's data while the new
// account's data loads, and any in-flight per-address fetch is invalidated.
export function resetUserScope() {
	// Invalidate per-address fetches that are still in flight (see store.ts
	// withAddressGuard): their captured generation no longer matches.
	bumpAddressGeneration();

	// Stop the self-rescheduling UTXO poller so it doesn't keep fetching for the
	// old address.
	stopUtxosPolling();

	// Clear user-scoped + per-address-derived stores up front.
	utxos.set([]);
	utxosAssets.set([]);
	utxosTokenInfos.set([]);
	utxosLoading.set(false);
	offersMy.set([]);
	loadingOffers.set(false);
	connected_wallet_balance.set(0);
	mewTier.set(0);
	authorizedMerchant.set(false);
	merchantName.set('');
	merchantSaleFee.set(0);

	// Drop unconfirmed/optimistic temp boxes for every address.
	clearTempBoxes();

	try {
		localStorage.removeItem(MEW_TIER);
	} catch {
		// localStorage may be unavailable (SSR); ignore.
	}

	for (const fn of extraResets) {
		try {
			fn();
		} catch (e) {
			console.error('userScope reset callback failed', e);
		}
	}
}
