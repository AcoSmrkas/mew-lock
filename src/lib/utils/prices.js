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

		const response = await fetch('https://api.cruxfinance.io/spectrum/token_list', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				sort_by: 'Volume',
				sort_order: 'Desc',
				limit: 500,
				offset: 0,
				filter_window: 'Day',
				name_filter: ''
			})
		});

		pricesData = await response.json();

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
