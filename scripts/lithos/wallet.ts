// Throwaway TESTNET-ONLY wallet for the Lithos lock testnet runner.
//
// The mnemonic lives in /.testnet/wallet.json (gitignored). The same keys
// encode to mainnet addresses too, so never send mainnet funds to it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Network } from '@fleet-sdk/common';
import { ErgoHDKey, generateMnemonic } from '@fleet-sdk/wallet';

const WALLET_DIR = resolve(process.cwd(), '.testnet');
const WALLET_FILE = resolve(WALLET_DIR, 'wallet.json');

// Index 0 deploys, locks and pays fees. Index 1 is the test "Mew fee" address
// the sweep must pay. Index 2 is a second user for lock-for and theft attempts.
export const ROLES = { main: 0, fee: 1, other: 2 } as const;
export type Role = keyof typeof ROLES;

export type TestKey = { role: Role; key: ErgoHDKey; address: string };

type WalletFile = { warning: string; network: 'testnet'; mnemonic: string; createdAt: string };

export function loadOrCreateWallet(): { created: boolean; keys: Record<Role, TestKey> } {
	let created = false;
	if (!existsSync(WALLET_FILE)) {
		mkdirSync(WALLET_DIR, { recursive: true });
		const file: WalletFile = {
			warning: 'TESTNET ONLY. Throwaway key for the Lithos lock testnet runner. Never fund on mainnet.',
			network: 'testnet',
			mnemonic: generateMnemonic(),
			createdAt: new Date().toISOString()
		};
		writeFileSync(WALLET_FILE, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
		created = true;
	}

	const file = JSON.parse(readFileSync(WALLET_FILE, 'utf8')) as WalletFile;
	if (file.network !== 'testnet') throw new Error(`${WALLET_FILE} is not a testnet wallet`);

	const root = ErgoHDKey.fromMnemonicSync(file.mnemonic);
	const keys = {} as Record<Role, TestKey>;
	for (const role of Object.keys(ROLES) as Role[]) {
		const key = root.derive(`m/44'/429'/0'/0/${ROLES[role]}`);
		keys[role] = { role, key, address: key.address.encode(Network.Testnet) };
	}
	return { created, keys };
}
