import { EE_API } from '$lib/common/const.ts';

export var prices = new Array();
export var pricesNames = new Array();
var gotPrices = false;
var callbackCalled = false;
var theCallback = undefined;
var pricesData = undefined;
var erg24hDiff = null;

export async function getPrices(callback) {
	theCallback = callback;

	try {
		const ergResponse = await fetch(`${EE_API}tokens/getErgPrice`);
		const ergData = await ergResponse.json();
		erg24hDiff = ergData.items[0].difference;
		prices['ERG'] = ergData.items[0].value;
		pricesNames['ERG'] = 'ERG';

		// Was api.cruxfinance.io/spectrum/token_list, which started returning
		// HTTP 200 with a truncated body and is now unreachable entirely. Now our
		// own feed, derived on-chain from Spectrum pool boxes; same field names,
		// wrapped in { items }.
		const response = await fetch(`${EE_API}tokens/getTokenPrices`);

		pricesData = (await response.json()).items;

		handlePrices();
	} catch (error) {
		doCallback();
	}
}

function handlePrices() {
	if (pricesData == undefined) {
		return;
	}

	for (let i = 0; i < pricesData.length; i++) {
		let tokenData = pricesData[i];

		if (prices[tokenData['id']] != undefined) continue;

		let skip = true;

		if (tokenData['liquidity'] >= 2000) {
			skip = false;
		}

		if (!skip) {
			let price = prices['ERG'] * tokenData['price_erg'];
			prices[tokenData['id']] = price;
			pricesNames[tokenData['ticker']] = price;
		}
	}

	gotPrices = true;

	doCallback();
}

function doCallback() {
	if (callbackCalled) {
		return;
	}

	if (theCallback) {
		theCallback();
	}
}
