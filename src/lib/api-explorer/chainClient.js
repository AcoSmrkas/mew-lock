// The browser half of chain.mewfinance.com/wallet/boxes, for the dApps.
// Source of truth: AcoSmrkas/chain-gateway `client/chainClient.mjs`. A dApp
// copies it to `src/lib/api-explorer/chainClient.js`; change it here, then
// copy it again.
//
// The gateway already applies pending transactions. What only the browser knows
// is the user's own transaction in the seconds before any mempool lists it. Its
// inputs are left out and its outputs added until the gateway's list shows the
// same, or for at most TEMP_TTL_MS (a transaction that never makes it).

const TEMP_TTL_MS = 10 * 60 * 1000;

/**
 * parse: how to read the answer; pass json-bigint's parse, since amounts reach
 * 2^63. fetchImpl and now are for tests.
 */
export function createWalletClient({
  base = 'https://chain.mewfinance.com',
  parse = JSON.parse,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  retryMs = 1500,
} = {}) {
  // By address: the boxes the user's own transactions spent and created.
  const sent = new Map();

  function updateTempBoxes(address, usedInputs, newOutputs) {
    let s = sent.get(address);
    if (!s) sent.set(address, (s = { inputs: new Map(), outputs: new Map() }));
    const at = now();
    for (const id of usedInputs ?? []) s.inputs.set(id, at);
    for (const box of newOutputs ?? []) s.outputs.set(box.boxId, { box, at });
  }

  function clearTempBoxes(address) {
    if (address === undefined) sent.clear();
    else sent.delete(address);
  }

  // One retry: the gateway restarts in about a second.
  async function read(address) {
    const url = `${base}/wallet/boxes/${address}`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        // No custom headers: they make the browser send a CORS preflight.
        res = await fetchImpl(url, { cache: 'no-store' });
      } catch (error) {
        if (attempt) throw error;
      }
      if (res?.ok) return parse(await res.text());
      const worthRetry = !res || res.status >= 500 || res.status === 429;
      if (attempt || !worthRetry) throw new Error(`wallet boxes for ${address}: ${res ? `HTTP ${res.status}` : 'no answer'}`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  /** The boxes the address can spend now, and the chain height: { items, height }. */
  async function fetchWalletBoxes(address) {
    const data = await read(address);
    const s = sent.get(address);
    if (!s) return { items: data.items, height: data.height };

    const listed = new Set(data.items.map((b) => b.boxId));
    const at = now();
    // An output the gateway lists is on its way; one it doesn't list is added.
    for (const [id, o] of s.outputs) if (listed.has(id) || at - o.at > TEMP_TTL_MS) s.outputs.delete(id);
    // An input the gateway no longer lists is known spent. One of our own new
    // outputs that a later transaction of ours spends stays left out too.
    for (const [id, t] of s.inputs) if ((!listed.has(id) && !s.outputs.has(id)) || at - t > TEMP_TTL_MS) s.inputs.delete(id);

    const items = data.items.filter((b) => !s.inputs.has(b.boxId));
    for (const { box } of s.outputs.values()) if (!s.inputs.has(box.boxId)) items.push(box);
    return { items, height: data.height };
  }

  return { fetchWalletBoxes, updateTempBoxes, clearTempBoxes };
}
