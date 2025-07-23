import { get } from 'svelte/store';
import {
	selected_wallet_ergo,
	connected_wallet_address,
	connected_wallet_addresses,
	wallet_init
} from '$lib/store/store.ts';
import { showCustomToast } from '$lib/utils/utils.js';

const KEY_WALLET_TYPE = 'connected_ergo_wallet';
export const KEY_ADDRESS = 'connected_address';

export async function connectErgoWallet(walletName, address = null) {
	if (walletName != 'ergopay' && !window.ergoConnector[walletName]) {
		showCustomToast(`${walletName} not detected.`, 4000, 'warning');
		return;
	}

	const isConnected = await connectWallet(walletName);
	if (isConnected) {
		if (walletName != 'ergopay') {
			connected_wallet_addresses.set(await ergo.get_used_addresses());

			let connectedAddresses = get(connected_wallet_addresses);

			if (address == null) {
				connected_wallet_address.set(connectedAddresses[0]);
				localStorage.setItem(KEY_ADDRESS, connectedAddresses[0]);
			} else {
				connected_wallet_address.set(address);
				localStorage.setItem(KEY_ADDRESS, address);
			}
		} else {
			localStorage.setItem(KEY_ADDRESS, get(connected_wallet_address));
			connected_wallet_addresses.set([get(connected_wallet_address)]);
		}

		selected_wallet_ergo.set(walletName);
		localStorage.setItem(KEY_WALLET_TYPE, walletName);
	}

	return isConnected;
}

async function connectWallet(wallet) {
	if (wallet == 'ergopay') {
		const connected_address = get(connected_wallet_address);
		if (!connected_address) {
			return false;
		}

		return true;
	} else {
		if (!window.ergoConnector) {
			showCustomToast('Please install Nautilus Wallet', 4000, 'danger');
			return false;
		}

		if (window.ergo) {
			return true;
		}

		let walletConnected;
		try {
			walletConnected = await ergoConnector[wallet].connect();
		} catch {
			walletConnected = false;
		}

		return walletConnected;
	}
}

export async function disconnectErgoWallet() {
	const wallet = get(selected_wallet_ergo);
	selected_wallet_ergo.set('');
	const address = get(connected_wallet_address);
	connected_wallet_address.set('');
	connected_wallet_addresses.set([]);

	localStorage.removeItem(KEY_WALLET_TYPE);
	localStorage.removeItem(KEY_ADDRESS);

	if (!window.ergoConnector || wallet == 'ergopay') {
		return true;
	} else {
		await ergoConnector[wallet].disconnect();
	}
}

export async function reconnectErgoWallet() {
	const walletName = localStorage.getItem(KEY_WALLET_TYPE);
	const address = localStorage.getItem(KEY_ADDRESS);

	if (walletName) {
		if (walletName == 'ergopay') {
			selected_wallet_ergo.set(walletName);
			connected_wallet_address.set(address);
		} else {
			try {
				await connectErgoWallet(walletName, address);
				selected_wallet_ergo.set(walletName);
				connected_wallet_address.set(address);
			} catch {
				//gonna catch em all!
			}
		}
	}

	wallet_init.set(true);
}
