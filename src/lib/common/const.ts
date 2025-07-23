import { BigNumber } from 'bignumber.js';
import axios from 'axios';
import { setLocalStorage, getLocalStorage } from '$lib/utils/utils.js';

export var ERG_LIST_FEE = 30000000; // 0.03 ERG
export var ERG_CANCEL_FEE = 10000000; // 0.01 ERG
export var DEV_FEE_NUM = 3000; // 3000 = 3%
export var ITEMS_PER_PAGE = 30;
export var MAX_BUNDLE_ASSETS = 10;

export const MIN_ERG_VAL = 1000000; // 0.001 ERG
export const ERG_DEV_SELL_FEE = 10000000; // 0.01 ERG
export const MAIN_PAGE_ITEMS_SINGLE = 10;
export const MAIN_PAGE_ITEMS_BUNDLE = 5;
export const ROYALTY_DENOM = 1000;
export const DEV_FEE_DENOM = 100000; // do not touch
export const MEW_TIER_DISCOUNT = 200; // 200 = 0.2%
export const MEW_TIER_MAX_DISCOUNT = 1000; // 1000 = 1%
export const VIP_MEW_TIER = 6;

//Payment token
export const TOKEN_NAME = 'CYPX';
export const TOKEN_ID = '01dce8a5632d19799950ff90bca3b5d0ca3ebfa8aaafd06f0cc6dd1e97150e7f';
export const TOKEN_DECIMALS = 4;
export const TOKEN_IMAGE =
	'https://raw.githubusercontent.com/spectrum-finance/token-logos/master/logos/ergo/01dce8a5632d19799950ff90bca3b5d0ca3ebfa8aaafd06f0cc6dd1e97150e7f.svg';

export var ASSETS = [];
export var TOKEN_RESTICTIONS = [];

//landing page and header navbar
export const MART_NAME = 'MewMart';
export const LOGO_TEXT =
	'<span style="color:cyan;font-family:Satisfy;font-size:1.3em;margin-right:3px;">Mew</span> Mart';
export const FOOTER_TEXT =
	'<span style="color:cyan;font-family:Satisfy;font-size:1.3em;">Mew </span> Finance';
export const HERO_DESCRIPTION = 'The cutest marketplace on the Ergo Blockchain!';
export const HERO_IMAGE = 'https://crooks-fi.com/images/mascot-splash.png';

// CATEGORIES
export var CATEGORIES = [];

// COLLECTIONS
export var COLLECTIONS = [];

//Dev
export const API_HOST = 'https://api.mewfinance.com/';
export const EE_API = 'https://api.ergexplorer.com/';
export const SOCKET_URL = 'https://socket.ergexplorer.com';
export const DEV_PK = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY';

export const CONTRACT =
	'2DnYaspUNUtsGfFELT8Bhvn1pGGE3nuHxyzxdDML4P31NgVPYZYwG2tsXJLsAWEvZRcKyBYXc6kUuoUpYVPHRpMQen36R2hFx4pBF6DmbeKWbXExsbXxyNaiQre58GUfwB2qktmaHETbgSSX64H2zFvCpPnLD8nPWAivN9zidxuWJyu1o8MxLf88bzJRBj8P3x75Qrd65KbfcWvFF9trYu6CyFc8M81DZ9GbPJVTNjvC9gdaRvkFBEWL8fM4xFTjZru3UT7NkbPy27RJwxgMNun7NQw3bhz3L5AGre4RXo8Ur4m3fJZjXK3GLUAGcTmV4VvjwF7WR3DDK2wiZGZnuWfkg8rXoyNBNf5NRe2FjoPWFU21R44ujLbnvsYRPZ5y24XzraKpLrYUhNDnMKHPqFo9CB6He8BnFWQzqQWJdWqYmdNgwbFC3yTuoyn1bNieRKPf2hXPMzQonRTcJBHLPXqgjhP39tbbc7fD83uDCxkyaT6TJzroCy7MU5TW159cDryPJQXwcbEir6EuACnqxs7e1BPzhFgDEdb3yw7m7rhvxYwcyk3mEamAdUJHxnnvi7M3uw8';
export const CONTRACT_ERGOTREE =
	'19a3030e05a01f05a01f05c09a0c040008cd02593abf7a55bd30ecb0d9cc89284f577db9c673bd6dba3642d5ec2eba1b131a02040202010400040204000400020204000100d80ed601e4e30002d602e4c6a70406d603e4c6a70605d60495917203730072037301d6057302d6069d9c72027e9ae4c6a709057204067e720506d607e4c6a70508d608e4c6a7070ed60993b172087303d60a9d9c72027e7204067e720506d60b7304d60cc2a7d60d93b1b5a4d9010d6393c2720d720c7305d60eafa5d9010e6394c2720e720c959372017306d802d60fb2a5730700d610b2a5730800d19683040195720996830201927ec1720f06997202720693c2720fd07207d801d611b2db6308720f73090096830301938c7211017208927e8c72110206997202720693c2720fd0720795720996830201927ec1721006720a93c27210d0720bd801d611b2db63087210730a009683030193c27210d0720b938c7211017208927e8c72110206720a720d720e95937201730bd801d60fb2a5730c00ea02d1968303019683030193c1720fc1a793c2720fd0720793db6308720fdb6308a7720d720e7207d1730d';
export const OLD_CONTRACTS_CRC32 = ['3975267984', '1997241762'];
export const CONTRACT_CRC32 = '1006322691';

export const ESCROW_CONTRACT =
	'CqjJEtjMcqQhymSxgjbjkBpA9jLyRYmdCUDx7krYBCAeASqJE56im7pdxjsjQkDfb33rCtYvB64wFZiFT3yMDc7xQSfR1c9JJi2ePVqn8d2skSL3AGM8wusrMd23q9WHACHfjye3RiaPLrRFEwDp8u8E3QFM2KsxLn5LNmnTCPy8rfX47DVqZYpbK5462rbnRLdyjWSR3G6Sc6cJUWSBEnpmcBkDZjyNkwpDEBZ97rBswT5HZU4ryTJP4x2wtsqUP3teJM9Ru2GWmx2UZynmiJF8mEeED8ZGH6AHjCf2EjTnigtSvxeaR3JyzmANWWQTKAb9dfpH8FxdhUEgF9kCMbGLWXe5sDw7xDZxAsqEsQFk1dovru48dMcyGapFahDprdCeLeBcGsqx1LkL5oEtGQUdGwDam7PRyq1A6YfWDCoF4g6vGWHzxdYy7zNtBrCaC2YcouKSrDmjiSrqL8wTcrxoEmnneLhue1XJH8NqE3qx9N89NA5MaZZjdkr58memPmH2i4zPpsSsR32kZr7zvCfEn6QnXed9P1HSc5uHV9kuW5QJpSfsRRwHykLXDLsxpJ9JVYaW2v8xo9Gh';
export const OLD_ESCROWS_CRC32 = ['1497470166', '1074363005'];
export const ESCROW_CRC32 = '3534619052';

export const OFFERS_CONTRACT =
	'Qn2EsTdde6bMH91AoCaTV2dLbxBbepqZpZurA17XNZSF8nNLMF9cWxJQ6sDf9pNpeXiQ8T4Ay2G5xCiiz7u8CVNvJrxBSwpUDwPff3N2KJM1Bokazqqn2pVKNDbdRLc76L599kQxEBqGNcVeG9yMUGVLBeJNZyHsCRnCACKj9CPsGW63mtgUdzNTnLUhNYQETir8auYF2aQuAqzSGfFUuqqg89uXZBcXt4XVe49aoydo1ffjAmPH6g6NdErjB7FNmKEx3dxGGtgJSbniC1znoY2uvpyEZVorCobdQ9hy6uQG8Ho3VXftn324VdeLYi9jd23XuUKCsT4YPaVG6naH7N1WRuMMxyC3sRkX3qqp3DNgcGh1oxrUm9BGjJrTw2G3b9j4QV9XrXBPdNJAuzU5BVw5jwNLyGWsCp8Ap6666YDRX95wSxrwftZjo6PyfYHNra6D6LwtPKGJM2L5b5k1afidudtFjyJhnHyu5JgjX7JNV72QXhYM2TfngV77zGu6Pr8kSHutgJHFAU8jbVv9DPVSyLEXsUKvWYvHVB2BNVi7THmyeZnmsoXUv87fWLKpFDjmQeqFg';
export const OFFERS_CRC32 = '1834725596';
export const OLD_CONTRACT_CRC32 = '3975267984';
export const OFFERS_ESCROW_CONTRACT =
	'4yfhLyYtvMW6AaafPT5vqXTaDXDRRG9S8zcE35DQNqWxjW9ZY938RadqRAZgMnJ2YdH2YLYV5UKoM8CyBJwCEK4jJq9arLXUKpySuvPBiur4Z6RiFZfPsxomXTJSif8xGNTdcR4CwHjFuVEAd7dMsjfaE44q24TgcRpVgcLScWGU9RNd6diFdYGXTUCdzvWKQkyrqMVCSmSkX2Rda7RVZyW9mK4fcbQiQUhspfsQihR7KUTSGms9WA96Zju1obeHue2wXgPf7kaBDZnbHgacEj7X3Gko6UTvjQHvtr3psWutF1TirS9NbwJYbRfceFqrY49ZTwaN48CdNEfxKPUJN4TUKHcjThcXFuJRjhyDMyVv54pQvnowJCoZzbdGu5KcYLXpLKQEJCytcrbtV5aCfbbahYbmqY2bsj1tdZXNeGyuySBsVfcmxW4g1dCtNqYsyXRHajGPd13cfGLtjEqtg6vkQEdzfSpuc3sVVmcmWEw6xeG9hYNyaqvyhgaaQEd7Z4uvibWgqD4pmrY2BB7yirZRAdn9ikL1xXEvD1WmCS3vMWbHUDKVdKnYxPFAGkHVHuJUt8F8z9WVtp1ep8U';
export const OFFERS_ESCROW_CRC32 = '1777493708';

// Delegation Constants
export const DELEGATE_CONTRACT =
	'3Nd4G6zdoRumeZvgjPKQ3gqZshAhkwR2RFbiDQsEsFtZ7FYRkpA8nwPN1oYMRKCcrxTjkFFhfTkAzJpJHXHZjy23cYfypziLQS3w5M4bUFJmJDHdtXW4uPNADeoJXRShgwzEn4NTxws4dJwqm7dcodNzw72tYsbAobnRWUpEyPGpKVbpUWaatgwtxyiWZbzaSrX4MWQSBNSegsxU5E9N1ybkxXjZFnazUwcMCNUSJvjeSsrqesvX4pn73YQscgmxmvPSV31TStvUfXpMTQaNaVRFazzhPH681osSD8PsTThDvkinznxsJsCZ91XGkJmJhpEJikvhVscQKK8EhQHyu3VmgGuKyDesydu35yjYZPZu2wxeQcyycwPmj1VwCWE2xAs7774XX4RL9os1dKEfYHSiejJo3jN8Y4Tmix8v7bb3KBCFS2d2gbxoGvAasR1pTkcmFYkz5faCChjxDr7S98YDDJDyfxo4Qgu1M6yP2Qvk4wLQqFzfevxSXQVo63jtDSKDRwjnHkgLAQAtadfizPbSrMcj4bHZdWGXAndS8iLFzwDwRoS2tX9Foqxyf9bp3F2NVhvfoRbTRYdxQtYW8zcsCkJYuXSVbUSsW4a9gepRMTDuWBkG4o6f';

// Delegation V3 Contract (with token fees and dynamic pricing)
export const DELEGATE_CONTRACT_V3 = '3Nd4G6zdoRumeZvgjPKQ3gqZshAhkwR2RFbiDQsEsFtZ7FYRkpA8nwPN1oYMRKCcrxTjkFFhfTkAzJpJHXHZjy23cYfypziLQS3w5M4bUFJmJDHdtXW4uPNADeoJXRShgwzEn4NTxws4dJwqm7dcodNzw72tYsbAobnRWUpEyPGpKVbpUWaatgwtxyiWZbzaSrX4MWQSBNSegsxU5E9N1ybkxXjZFnazUwcMCNUSJvjeSsrqesvX4pn73YQscgmxmvPSV31TStvUfXpMTQaNaVRFazzhPH681osSD8PsTThDvkinznxsJsCZ91XGkJmJhpEJikvhVscQKK8EhQHyu3VmgGuKyDesydu35yjYZPZu2wxeQcyycwPmj1VwCWE2xAs7774XX4RL9os1dKEfYHSiejJo3jN8Y4Tmix8v7bb3KBCFS2d2gbxoGvAasR1pTkcmFYkz5faCChjxDr7S98YDDJDyfxo4Qgu1M6yP2Qvk4wLQqFzfevxSXQVo63jtDSKDRwjnHkgLAQAtadfizPbSrMcj4bHZdWGXAndS8iLFzwDwRoS2tX9Foqxyf9bp3F2NVhvfoRbTRYdxQtYW8zcsCkJYuXSVbUSsW4a9gepRMTDuWBkG4o6f';

export const DELEGATION_DEV_PK = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY';
export const DELEGATION_FEE_DENOM = 100000;
export const DELEGATION_MIN_FEE_PERCENT = 3000; // 3% minimum

// Lending Contract Constants - SECURE VERSION (locks loan tokens)
export const LENDING_CONTRACT = '2KvHAirbXGYnZh6mZzd59qcii7mHQSLzdUVQz37J1XDvAjQUopVahxU9roMRuE8J9r9xSbUebVk45Bu2ZtESuMKeepCj5bn52VRJxk41zWgzvYES4dgUxMKdmVrKB6yCwF7gok37vwdkxXvv1YWMAnzvibEgKJyH73KsnUyNa3uaTL89jozrUsWfCcGeYmhAkLHGndXy2kazg1hjauWHKaH3eVDeYZizP7Gbe16tcPuhXgiZ9USo96CtWRd5qMiY42Q5FeWcLohcWjLwc8szr8ZrLiksn9UzQhPzEqCMKjkTi1MeDkPt5Mo3NXxecAQ27iWAecp7YcyzpDrwr2Swnvvc5kesCfp4R6DFsEW6jvJahRqfek7KyrKZQYunTVQfpSi7FpJcCVR5C3iBG6cUTtGH3JWfKrBux8mwmYpf544jW1AYD69iU6C1pLW4mzdsAHefH2JBxXzAf82CwxpnjEG8YJAvT8k9Vz84eGNEeqY5nQwTvZY5VKeRFSwvvNMptRwSsmhDhZfyEmFy6Lc6LRSiHkt7Kw74onk9EnCUJp3321qbkYuNnX5dw9Y2457JKjfNPM23CNz56iEMpPAmsKoPHQTbrcFnhZ3jEd3XKzrdjWvJfXgsGmVeFL6H7oKQmfy2bi4YxT2mXwz57rioonV3wZ2nAqohh5A6T9rytn4GoNxjKCnAo59FpjJC2hduHGY2PbC3fusPkHU7bCHmyNQtWaqc8Mk9sB4XQGDimGz2YfNg4e9Vk9xkCdteALVgenYGnqCRDfjUc';
export const LENDING_DEV_PK = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY';
export const LENDING_FEE_DENOM = 100000;
export const LENDING_MIN_FEE_PERCENT = 3000; // 3% minimum

// Storage Rent Vault Constants
export const STORAGE_RENT_COLLECTORS = [
	{
		name: 'ErgoCloud',
		address: '9gvDVNy1XvDeFoi4ZHn5v6u3tFRECMXGKbwuHbijJu6Z2hLQTQz',
		description: 'Premium storage service with 99.9% uptime'
	},
	{
		name: 'ErgoVault',
		address: '9f4QF8AD1nQ3nJahQVeD8QvjwXfxDbk1jMD8VJqF2FmPQwrtCvT',
		description: 'Decentralized storage with built-in redundancy'
	},
	{
		name: 'StorageDAO',
		address: '9gR5mK9XyD2qV7jMJgQ6Hf1P8TtN3oF9sKcLgWq2XrB1uYwvHgS',
		description: 'Community-driven storage solutions'
	},
	{
		name: 'ErgoKeep',
		address: '9j7P3kR8zD5tH1qM9LfK6wN2sT4rY8pE3oC7vB9nG1xQ5uWmF2S',
		description: 'Long-term storage specialist'
	},
	{
		name: 'BlockVault',
		address: '9n8F2jK5xR4uQ3bT7mP6yW1sH9gL8eD4vC2nB7oK5rT3qY1pFgS',
		description: 'Enterprise-grade secure storage'
	}
];

export const KYA_KEY = 'mewmart_kya_accepted';
export let popupData = null;

export async function getConfig() {
	let config = getLocalStorage('config');
	let restrictions = getLocalStorage('restrictions');

	if (config == null) {
		config = (await axios.get(`${API_HOST}mart/getConfig?mart=main`)).data;
		setLocalStorage('config', config, 60);
	}

	if (restrictions == null) {
		restrictions = (await axios.get(`${API_HOST}mart/getTokenRestrictions`)).data;
		setLocalStorage('restrictions', restrictions, 60);
	}

	TOKEN_RESTICTIONS = restrictions.items;

	CATEGORIES = config.categories.filter(
		(item) => item.name != 'Phygital' && item.name != 'Services'
	);

	COLLECTIONS = config.collections.map((item) => item.tokenid);

	ASSETS = config.assets;

	ERG_LIST_FEE = new BigNumber(config.config.LIST_FEE).times(10 ** 9).toNumber();
	ERG_CANCEL_FEE = new BigNumber(config.config.CANCEL_FEE).times(10 ** 9).toNumber();
	DEV_FEE_NUM = new BigNumber(config.config.DEV_PERCENT).times(1000).toNumber();
	ITEMS_PER_PAGE = config.config.ITEMS_PER_PAGE;
	MAX_BUNDLE_ASSETS = config.config.MAX_BUNDLE_SIZE;

	if (config.popup) {
		popupData = config.popup;
	}
}
