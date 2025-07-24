import { get } from 'svelte/store';
import {
	selected_wallet_ergo,
	connected_wallet_address,
	showNsfw,
	assetsInfos,
	showPleaseWaitModal
} from '$lib/store/store';
import axios from 'axios';
import { goto } from '$app/navigation';
import { SConstant, SLong } from '@fleet-sdk/serializer';
import { ErgoAddress } from '@fleet-sdk/core';

let toastTimeout = null;

function getDecimals(value, additional = 1) {
	if (value < 0) {
		value *= -1;
	}

	value = value.toString();
	if (value.includes('e-')) {
		let eIndex = value.indexOf('e-');
		return value.substr(eIndex + 2);
	}

	let decimals = 2;
	value = value.split('.');
	if (value.length > 1) {
		let realSmall = value[1].split('-');
		if (realSmall.length > 1) {
			decimals = parseInt(realSmall[1]) + 1;
		} else {
			for (let j = 0; j < value[1].length; j++) {
				if (value[1][j] != '0') {
					decimals = j + additional;

					if (value[1].length > j + 1 && value[1][j + 1] != '0') {
						decimals++;
					}

					break;
				}
			}
		}
	} else {
		decimals = 2;
	}

	if (decimals < 2) {
		decimals = 2;
	}

	return decimals;
}

export function nFormatter(num, useChar = true, noDeci = false) {
	if (num == undefined) {
		return num;
	}

	num = Number(num);
	let digits = getDecimals(num);

	const lookup = [
		{ value: 1, symbol: '' },
		//  { value: 1e3, symbol: "k" },
		{ value: 1e6, symbol: 'M' },
		{ value: 1e9, symbol: 'B' },
		{ value: 1e12, symbol: 'T' },
		{ value: 1e15, symbol: 'P' },
		{ value: 1e18, symbol: 'E' }
	];

	if (num > 10) {
		digits = 2;
	}

	let minimumFractionDigits = 2;
	if (digits < minimumFractionDigits) {
		minimumFractionDigits = digits;
	}

	const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
	var item = lookup
		.slice()
		.reverse()
		.find(function (item) {
			return num >= item.value;
		});

	if (!useChar) {
		item = null;
	}

	if (noDeci) {
		minimumFractionDigits = 0
		digits = 0;
	}

	return item
		? (num / item.value)
				.toLocaleString('en-US', {
					maximumFractionDigits: digits,
					minimumFractionDigits: minimumFractionDigits
				})
				.replace(rx, '$1') + item.symbol
		: num.toLocaleString('en-US', {
				maximumFractionDigits: digits,
				minimumFractionDigits: minimumFractionDigits
		  });
}

export function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function showCustomToast(text, time, type = 'default') {
	const toastElement = jQuery('#customToast');
	const toastBody = jQuery('#customToastBody');

	// Reset classes and styles
	toastElement.removeClass('bg-success bg-danger bg-warning bg-primary bg-info');
	toastBody.removeClass('text-white');

	// Set dark theme
	toastElement.addClass('bg-dark text-white');

	let icon = '';

	switch (type) {
		case 'success':
			icon = `<svg class="me-2" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="#4CAF50"/>
          </svg>`;
			break;
		case 'error':
		case 'danger':
			icon = `<svg class="me-2" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="#F44336"/>
          </svg>`;
			break;
		case 'info':
			icon = `<svg class="me-2" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="#2196F3"/>
          </svg>`;
			break;
		case 'warning':
			icon = `<svg class="me-2" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
            <path d="M1 21H23L12 2L1 21ZM13 18H11V16H13V18ZM13 14H11V10H13V14Z" fill="#FFC107"/>
          </svg>`;
			break;
		default:
			break;
	}

	toastBody.html(
		`<div style="display: flex; align-items: center;">${icon}<span>${text}</span></div>`
	);

	toastElement.off('click');

	const toastLiveExample = document.getElementById('customToast');
	const toast = new bootstrap.Toast(toastLiveExample);
	toast.show();

	if (toastTimeout != null) {
		clearTimeout(toastTimeout);
		toastTimeout = null;
	}

	if (time > 0) {
		toastTimeout = setTimeout(() => {
			toast.hide();
		}, time);
	} else {
		toastElement.click(() => {
			toast.hide();
		});
	}
}

export async function getConnectedWalletAddress() {
	const selectedWalletErgo = get(selected_wallet_ergo);
	const connectedWalletAddress = get(connected_wallet_address);

	if (
		selectedWalletErgo &&
		selectedWalletErgo != 'ergopay' &&
		window.ergoConnector[selectedWalletErgo]?.isConnected
	) {
		return await ergo.get_change_address();
	} else if (selectedWalletErgo && selectedWalletErgo == 'ergopay') {
		return connectedWalletAddress;
	} else {
		return '';
	}
}

export function isWalletConected() {
	const selectedWalletErgo = get(selected_wallet_ergo);

	return (
		(selectedWalletErgo &&
			selectedWalletErgo != 'ergopay' &&
			window.ergoConnector[selectedWalletErgo]?.isConnected) ||
		(selectedWalletErgo && selectedWalletErgo == 'ergopay')
	);
}

export function formatNftUrl(r9RenderedValue) {
	let link = hex2a(r9RenderedValue);

	if (link.includes('ipfs://')) {
		link = link.replace('ipfs://', '');
		link = 'https://nftstorage.link/ipfs/' + link;
	} else if (link.includes('https://ipfs.infura.io')) {
		link = link.replace('https://ipfs.infura.io', 'https://ipfs.io');
	} else if (!link.includes('https://') && !link.includes('http://')) {
		link = 'https://gateway.pinata.cloud/ipfs/' + link;
	}

	return link;
}

export function hex2a(hexx) {
	if (hexx == undefined) {
		return undefined;
	}

	let hex = hexx.toString(); //force conversion
	let str = '';

	for (let i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
	}

	return str;
}

export function getImageUrl(token) {
	try {
		let aInfo = get(assetsInfos);

		const assetInfoMap = new Map(aInfo.map((item) => [item.id, item]));
		let tokenInfo = assetInfoMap.get(token.tokenId);

		if (tokenInfo && !token.isUpdated) {
			token.isUpdated = true;
			token.name = tokenInfo.name;
			token.decimals = parseInt(tokenInfo.decimals);

			if (tokenInfo.additionalRegisters) {
				const r7SerializedValue = tokenInfo.additionalRegisters.R7?.serializedValue;
				if (r7SerializedValue === '0e020101') {
					token.isImage = true;
				}
				if (r7SerializedValue === '0e020102') {
					token.isAudio = true;
				}
				if (r7SerializedValue === '0e020103') {
					token.isVideo = true;
				}
			}

			if (tokenInfo.cachedurl && tokenInfo.cachedurl !== '') {
				token.imageLink = tokenInfo.cachedurl;
			} else if (tokenInfo.additionalRegisters.R9?.renderedValue) {
				token.imageLink = formatNftUrl(tokenInfo.additionalRegisters.R9.renderedValue);
			} else {
				token.imageLink = '';
			}

			token.nsfw = tokenInfo.nsfw;
			token.scam = tokenInfo.scam;
			token.mintTx = tokenInfo.transactionId;
		}
	} catch (e) {
		//
	}

	if (token.nsfw && !get(showNsfw)) {
		return getPlaceholderImage(token);
	}

	let imageUrl;

	if (hasIcon(token.tokenId)) {
		return getIcon(token.tokenId);
	}

	imageUrl = token.imageLink || `https://spectrum.fi/logos/ergo/${token.tokenId}.svg`;

	return imageUrl;
}

function getPlaceholderImage(asset) {
	let imgSrc = '/default/token.png';

	if (asset.isImage) {
		imgSrc = '/default/nft-image.png';
	}

	if (asset.isAudio) {
		imgSrc = '/default/nft-audio.png';
	}

	if (asset.isVideo) {
		imgSrc = '/default/nft-video.png';
	}

	return imgSrc;
}

export function setPlaceholderImage(e, asset) {
	let imgSrc = getPlaceholderImage(asset);

	jQuery(e.target).prop('src', imgSrc);
}

export function destroy(e) {
	jQuery(e.currentTarget).remove();
}

export function destroyParent(e) {
	jQuery(e.currentTarget).parent().remove();
}

export function truncateAddress(address) {
	return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'N/A';
}

export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function isMobileDevice() {
	return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function getCommonBoxIds(array1, array2) {
	// Create sets of boxIds from both arrays
	const set1 = new Set(array1.map((obj) => obj.boxId));
	const set2 = new Set(array2.map((obj) => obj.boxId));

	// Use filter and has method to find common boxIds
	return Array.from(set1).filter((boxId) => set2.has(boxId));
}

export function consumeClick(event) {
	event.stopPropagation();
}

export async function sendMessageToGroup(message, botToken, groupId) {
	const sendMessageEndpoint = `https://api.telegram.org/bot${botToken}/sendMessage?parse_mode=HTML&disable_web_page_preview=true`;

	const params = new URLSearchParams({
		chat_id: groupId,
		text: message
	});

	try {
		const response = await axios.post(sendMessageEndpoint, params);
		if (response.data && response.data.ok) {
			console.log('Message sent successfully!');
		} else {
			console.log('Failed to send the message.');
		}
	} catch (error) {
		console.error('Error sending message:', error);
	}
}

export const setLocalStorage = (key, value, ttlMinutes) => {
	const ttl = ttlMinutes * 60 * 1000; // Convert minutes to milliseconds
	const expiry = Date.now() + ttl;

	const data = {
		value,
		expiry
	};

	localStorage.setItem(key, JSON.stringify(data));
};

export const getLocalStorage = (key) => {
	const itemStr = localStorage.getItem(key);

	if (!itemStr) {
		return null; // Key not found
	}

	const item = JSON.parse(itemStr);
	const now = Date.now();

	// Check if the item has expired
	if (now > item.expiry) {
		localStorage.removeItem(key); // Remove expired item
		return null;
	}

	return item.value; // Return the stored value
};

export function showPleaseWait() {
	showPleaseWaitModal.set(true);
}

export function hidePleaseWait() {
	showPleaseWaitModal.set(false);
}

export function updateSearchParams(param, value, page) {
	let changed = false;

	if (value && page.url.searchParams.get(param) !== value) {
		page.url.searchParams.set(param, value);
		changed = true;
	} else if (value === null && page.url.searchParams.get(param) !== null) {
		page.url.searchParams.delete(param);
		changed = true;
	}

	if (changed) {
		goto(page.url.toString(), { replaceState: true, keepFocus: true });

		const event = new CustomEvent('urlChanged', {
			detail: { params: page.url.searchParams }
		});
		window.dispatchEvent(event);
	}
}

export function parseMempoolBoxToOrder(box) {
	const pricenano = parseInt(SConstant.from(hexToBytes(box.additionalRegisters.R4)).data);

	const hexToUint8Array = (hex) =>
		new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
	const sigmaProp = ErgoAddress.fromPublicKey(
		hexToUint8Array(box.additionalRegisters.R5.substring(4))
	);

	// Get the encoded address
	const seller = sigmaProp.encode();

	const fee = parseInt(SConstant.from(hexToBytes(box.additionalRegisters.R6)).data);
	const asset = bytesToString(SConstant.from(hexToBytes(box.additionalRegisters.R7)).data);
	const info = bytesToString(SConstant.from(hexToBytes(box.additionalRegisters.R8)).data).split(
		','
	);
	const royalty = parseInt(SConstant.from(hexToBytes(box.additionalRegisters.R9)).data);

	const mart = info[0];
	const category = info[1];
	const type = info[2];

	const decimals = 0;
	const price = 1000; // asset === '' ? pricenano / (10 ** 9) : pricenano / (10 ** decimals);

	const outBox = {};

	outBox.contract = '1006322691';
	outBox.seller = seller;
	outBox.buyer = null;
	outBox.payasset = asset === '' ? 'ERG' : asset;
	outBox.payamount = price;
	outBox.category = category;
	outBox.timestamp = getFormattedTimestamp();
	outBox.buytime = null;
	outBox.boxin = box.boxId;
	outBox.txidin = null;
	outBox.txidout = null;
	outBox.payassetname = null;
	outBox.assets = box.assets;
	outBox.ismempool = true;
	outBox.box = box;

	return outBox;
}

export function hexToBytes(hex) {
	return Uint8Array.from(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

function bytesToString(bytes) {
	return new TextDecoder().decode(bytes);
}

function getFormattedTimestamp() {
	const now = new Date();
	return now.toISOString().slice(0, -1); // Removes the 'Z' at the end
}
