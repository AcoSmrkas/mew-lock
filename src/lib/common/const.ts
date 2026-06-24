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
export const DEV_PK = '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED';

export const CONTRACT =
	'2DnYaspUNUtsGfFELT8Bhvn1pGGmPsrgnz2WmbyLokDL7zSRQALQctRtqXwYiY9r2N5ei7kUQhHQjLgzVVtfkPKRtm5aDBryFjadJTP51N8UFsaEWMwKGi4yood3ANENsUG5pG6yqz7iiFta812t22vJvguQPqXA1tJVCTtmXwb3NHrERr5RvHK1oAEQvxoidzCtiBt7FoZ3UpdasSExhSSfMKoMhrrrBmsohLDmZA9iKLySGMT2kYfVyoXFx54DwYxh7WfCJqzZgR4cwdzqZ2avWVNc9DRb5VdV5CwuKyavWKkGrTonPvYQsu6ZcTU5NHVnShiwAyPXjXJNdBnfkh75orCH21TFxqoryKYiokmR9Z329BP9cJ6PZCLsxSp7ZxVs2CdKYYrG3MMBbdXBUYk5JHNN2CsoBYP3EUMDx9kJghHs3eBVA7yH6g2TuTZEgFJqm5zrxj5GtyiMG64fNh1uBNTrvVdpnfwhuDHnbEcrDGDLwQ6fratQfB67sWer3ixzxtdWw2iP5UN2whM1tPwYu594tUDoVRZVimcopXcgXngzeTiR9GQ24WdugUsSLZMyxKv';
export const CONTRACT_ERGOTREE =
	'19a3030e05a01f05a01f05c09a0c040008cd02593abf7a55bd30ecb0d9cc89284f577db9c673bd6dba3642d5ec2eba1b131a02040202010400040204000400020204000100d80ed601e4e30002d602e4c6a70406d603e4c6a70605d60495917203730072037301d6057302d6069d9c72027e9ae4c6a709057204067e720506d607e4c6a70508d608e4c6a7070ed60993b172087303d60a9d9c72027e7204067e720506d60b7304d60cc2a7d60d93b1b5a4d9010d6393c2720d720c7305d60eafa5d9010e6394c2720e720c959372017306d802d60fb2a5730700d610b2a5730800d19683040195720996830201927ec1720f06997202720693c2720fd07207d801d611b2db6308720f73090096830301938c7211017208927e8c72110206997202720693c2720fd0720795720996830201927ec1721006720a93c27210d0720bd801d611b2db63087210730a009683030193c27210d0720b938c7211017208927e8c72110206720a720d720e95937201730bd801d60fb2a5730c00ea02d1968303019683030193c1720fc1a793c2720fd0720793db6308720fdb6308a7720d720e7207d1730d';
export const OLD_CONTRACTS_CRC32 = ['3975267984', '1997241762', '1006322691'];
export const CONTRACT_CRC32 = '3955924278';

export const ESCROW_CONTRACT =
	'CqjJEtjMcqQhymSxgjbjkBpA9jSDXFj1EbTvLhmzKvHnavd47SXmaWekznyCvF4B2TpwJMQs9mh3BRJ4Wi6qnKbmn4EGPfEu5FsnnjWteFXLC5ZSAWwuSpYVQE3KAsAErd4TCSHastkMZi72hYmY2UZniw3UJ6KVpcFMtNLiBZFTM7YEfpcgTWgyuovjGau7Azyi7bX6fS2vpVFsyhdFy4mTqgLdcVZYf3Pm2KpXWc8zq6Hx9piRcgRwuBCAq42Xvu1NfqwZDJmmZNLew4MKxn1NjYkTENrYwXL9eS98cGSVYrfYmnSQ5Kt9uFPJfCzLc1FQGLEp2iyk8AdGBu5FcYg9BNERybdfmQeKMKBj6pm1u6GhmtW3iacqAXYFmJATjd9Z2f32HHou4x4wwjCjfJsxRdzcht5x6EdhkEsuhoyaByJXkG1jgMLzehe16bDS4geHpAQRrU72Yq2wHyLcX1SgobNEGZzhwTRnk5ic229QAGSa9wonrMEsZwvxyXjtgY7YHPWzM5km8AxR7Yqq7nx6aRa6rM7fdemELZ9pZG41JnCBTz61NCvwGB2xN5evsntvqndhyYtV5Pbp';
export const OLD_ESCROWS_CRC32 = ['1497470166', '1074363005', '3534619052'];
export const ESCROW_CRC32 = '3223359359';

export const OFFERS_CONTRACT =
	'Qn2EsTdde6bMH91AoCaTV2dLbxBbepqZpZurA17XNZSF8nNLMF9cWxJQ6uD9o7D3S94dLRhHYJ8F4JESkGHBxmfsoVfekSQZcCiCNSyh2UDUo7BATjinvh4roWqH8nLZmCPdMaucLjXFo5TX4Y6QVNkogmXmBmbxZ2T5heAWKkSnCd3i9oZRjGmByoQBP2dKJG4SvMhtVJ7x2aRiYzjW2oALqKZ7YGukJHy61FanVsE7ZYSXamzv37chXwtUm39kD287kHStcdg4QuNHWHmbtQF4zJF5VoJ7jzVBXpNCR7cVDwMSqMSTDzRRD4Mmf3ZvAV1EMUXpcXCfY9Pi9PE1KBXGYoJoU37aqS9YEeztdcdm9mpuj3AweLBT3eTLEaytyW1EkQ6ayFCup4DP5Czf3joZt7XwAa5uXnuENMLSkhfMFydeTfsAAHzi7bH5aEytrwsVdGtdyUYX7cExfVDnBGmnzwQtsDKgRW4pjMY5FXn6EiGFDUd6DJXvdwD6fdWwjz4yZHqj1pgaNq5RqD1oMakpeyui9RXsoDdgynddBmHjKWvjc2dHfD2VyzdeXM8Gm9CsmcDM1';
export const OFFERS_CRC32 = '1716819484';
export const OLD_CONTRACT_CRC32 = '3975267984';
export const OFFERS_ESCROW_CONTRACT =
	'4yfhLyYtvMW6AaafPT5vqXTaDXDRRG9S8zcE35DQNqWxjW9ZY938RadqRAtzo1VRPhSHJLNxUq6VkpM3Mx3jWRkiHqqw6rr1HCghXN4ZSSa3odxyyhpeWAinEgFf2QZy2Zz5NpheBEjHZbgw3grFxxS1CJ4T6hgt2ngJTVsiwbr2BCY5DbGYdY6u9VHqvHkjJN25RgADQMWVKph9XuNd2y95zJRpoxKjLqC8szx2pi5dgioc51U4doVDiFbs6T9wmsjvvyTmkLQ1QYYgz61VPhFKsMYEXBBowNqx3k25Gum9iktkUMZoWV2LqG8hwG8LmBbaMqbpu6DCVx45fetkVd7MqdomCDsNpPFCi7YbKycwKUvqiPjDj9yp2A9Xxi9qWSN3Fg9HMxvjKExsi4CqWdQN8TG8QrrSxbj5ARPkthJbcu5nMg2kRwRc323Uem66d7ws4oPGgjLXQr1htDuzruotzAcFp3R6QpAdeQRKVrbXQcPN7LzAAKYRz3hzZi44eZrk8Pua3etbsuatArx61tYkMNftVjiJUNUzB3DL1PpMjCukv8W52qtPC5BdffEpWbCxwEgAXUZdXBCrogy';
export const OFFERS_ESCROW_CRC32 = '2561975767';

// Delegation Constants
export const DELEGATE_CONTRACT =
	'6typ9JZo4QQzDaQo2vBrmGxs67geRWFs5AyyFAGrPVbwjZAgmwDNBKLG2NQHRB1u3Ay5fs6VQVsFFn7EinrCgEiGZLJskR14F85wF58LQ7HszCXrRTtAtNfBfQ4hPKtk2uV3ZNL77ontGRmDUUrpHjVNAAbNksU8wT3vqmssVuoGSCegHthtsaMqhfiJ7hUoLqEA3KXvwHc4vTsbkjFQULexgQURehMt7S6tnB98EEcJ7bSpzGejHfc4Fn33HFJdj4ndcgmd9DtFtNYHD2twjJYhNtMyAQtEXyJUCkRU89f45Ntz41U1jQ9ig95UmhLvsvNc3VKhVbddvondY8TkZijvCHBXVK54pDexWbpKaxQBTGvXRYq4N8FVf6d5NsY4LMgVRP4fCieMCP5Z5nY8ojZuZyk1S56dJnza9o9f6Cynff7LxoUuYoWyABoESxwmqx67aX8VqxPFQvKNqExH4c9SKwF86PbvQisBTvcM9rFEWMoZf4symNiof4Y457Tw2wdEaMfa2gxH7EiGkBTNarv8jX3xhKdd373nGnpFqXa38Me3MQEE3k4LoLmQcebTe5JhR6PitHKq25sM7qwa4B8';

// Delegation V3 Contract (with token fees and dynamic pricing)
export const DELEGATE_CONTRACT_V3 =
	'6typ9JZo4QQzDaQo2vBrmGxs67geRWFs5AyyFAGrPVbwjZAgmwDNBKLG2NQHRB1u3Ay5fs6VQVsFFn7EinrCgEiGZLJskR14F85wF58LQ7HszCXrRTtAtNfBfQ4hPKtk2uV3ZNL77ontGRmDUUrpHjVNAAbNksU8wT3vqmssVuoGSCegHthtsaMqhfiJ7hUoLqEA3KXvwHc4vTsbkjFQULexgQURehMt7S6tnB98EEcJ7bSpzGejHfc4Fn33HFJdj4ndcgmd9DtFtNYHD2twjJYhNtMyAQtEXyJUCkRU89f45Ntz41U1jQ9ig95UmhLvsvNc3VKhVbddvondY8TkZijvCHBXVK54pDexWbpKaxQBTGvXRYq4N8FVf6d5NsY4LMgVRP4fCieMCP5Z5nY8ojZuZyk1S56dJnza9o9f6Cynff7LxoUuYoWyABoESxwmqx67aX8VqxPFQvKNqExH4c9SKwF86PbvQisBTvcM9rFEWMoZf4symNiof4Y457Tw2wdEaMfa2gxH7EiGkBTNarv8jX3xhKdd373nGnpFqXa38Me3MQEE3k4LoLmQcebTe5JhR6PitHKq25sM7qwa4B8';

export const DELEGATION_DEV_PK = '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED';
export const DELEGATION_FEE_DENOM = 100000;
export const DELEGATION_MIN_FEE_PERCENT = 3000; // 3% minimum

// Lending Contract Constants - SECURE VERSION (locks loan tokens)
export const LENDING_CONTRACT =
	'4vLjuLN1nYeFT6oWQbom1puQu6SW3nPCTPdVJSQUmePJwDrqAUjrQ1bRyu42Qujv3dbhdJgh1kK2qHhedEtJkBaUaHd8xvkXq4es3GD4TGtL67NznLtbPp9urVJVJnTfFCqXbfAudGhJZmJ1ofS2LPUWL395xNi3gKcuU5yjUSuHuZqVfaS99rFEwtBSQqQ1rgahdpdFubPDKLLgrEMo58D9WwmU3dNrD9GVRM4BMV8CGBrhTb5stuRgWAAKLR9eHtzWU5RRXcGMPbhx2X6bPj6XFXki8oV2JsAcQmZJukw5VPNLavfuNmckWFhAK3FQBPcb7ty4iXgxezVogk48cFXo7kAxhms6mCMf3E3zeYTAaGvMBFQduH2dbiGro3LmHYXmKNcEuDcD14ZGLVH8hVarSGxuHrmZBVW6uFAbsanB9bD74Ls6VbFmVb2so6WhBxpnKpHP8tZ5XApbp1781F9Dt3WBvhPTgraB9yLnWJESYRcMU2PmUNxCYDJdNPFDWhPqdw62V4R8MmH2UAp2oQrpMmmcNgsQ5ajbWZrgYY7NHu2ATGEi3YDcBg5r482rMmfoYXFPE5EAPFpSYBGtWb7im92hxdDRjKsoGNKXjUuppY4xyTYr1JgrccCRsYE7y295qiXWQCkcnbbjprRifxXzffsCcGyLea96JoJzTtLxefYyrpYoWEZ4L63ti2Yjy9dghuZedQgemsBHuXpLtee9dj7SavScNMfPya3yMWpEVG5PrzrUiWE8SDYzj2GTrsHnxSPyfSZwp1o4czXtrp7LZYR9Es2Pzgc2ZBFn64XvqzTbzhH7cYii9oCLgg6agZ8g8Ps1kod7gjD6CB3REvYEkiZH71jFYiGkctkZNwrskP4GKuxCYvX31uzhHP75pCvhEc1U6SFa2bF8PjKW6Nitd37L1FGhBYB8XkBS1LMvz8BxuPCQ6eZLsyQVS4cCF';
export const LENDING_DEV_PK = '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED';
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
