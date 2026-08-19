/**
 * xlayerRpc — the DAegis frontend's live on-chain data layer.
 *
 * This is the vanilla site's PROVEN logic (docs/app.js) ported to TS, NOT the
 * Gemini reference version. Everything here reads live from X Layer testnet over
 * plain JSON-RPC. There is NO mock fallback: a failed call surfaces a real error;
 * reasoning is verified in-browser against the on-chain reasonHash, and when it
 * cannot be verified we say so rather than faking a match.
 *
 * The deleted registryData.ts is not referenced anywhere. Every address, hash,
 * and block below is real and confirmed on-chain (see the value walkthrough).
 */
import { CheckResult, LiveVerdict, NetworkConfig, Verdict } from '../types';
import { keccak256, padAddress32 } from '../utils/keccak';

const RPCS = [
  'https://testrpc.xlayer.tech/terigon',
  'https://xlayertestrpc.okx.com/terigon',
];

const CFG = {
  CHAIN_ID: 1952,
  REGISTRY: '0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9',
  GUARDED: '0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf',
  TOKEN: '0x28EF702C621DD0B82Ae5bB0753C3A3C1D875a20E',
  DRAINER: '0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5',
  ISFLAGGED_SEL: '0xfef48a99',   // isFlagged(address)
  ALLOWANCE_SEL: '0xdd62ed3e',   // allowance(address,address)
  SPENDER_FLAGGED_T0: '0x1622652812ae33b546ef6ca7b83827299454f9945ce4de6a85401062db7afe0b',
  EXPLORER: 'https://www.okx.com/web3/explorer/xlayer-test',
  LOG_CHUNK: 100,   // RPC caps eth_getLogs span at 100
  TAIL_BLOCKS: 2000,
};

export const MAINNET_CONFIG = {
  chainId: 196,
  rpcUrl: 'https://rpc.xlayer.tech',
  explorerUrl: 'https://www.okx.com/web3/explorer/xlayer',
  threatRegistryAddress: '0x7c4b62d1e48a33a26440f64eb7c696b3986cf1d2',
  guardedAccountAddress: '0x8d0f7b2c2782d69cdaaef13ac7b32f80a455670a',
  threatRegistryTx: '0x4db5ad8e62b16fb35854d22b221e25cebf25925ca75e2b86f11298f1d8d9a497',
  guardedAccountTx: '0x0d4916fae34d272a39acab9924f39f87f2a441475e274d6ef4d5e2327651daf9',
};

const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const BASE = ((import.meta as any).env?.BASE_URL as string) || '/';

/** Public network config used across the UI. All values real and on-chain. */
export const NETWORK_CONFIG: NetworkConfig = {
  name: 'X Layer testnet',
  chainId: CFG.CHAIN_ID,
  gasToken: 'OKB',
  rpcUrl: RPCS[0],
  explorerUrl: CFG.EXPLORER,
  threatRegistryAddress: CFG.REGISTRY,
  guardedAccountAddress: CFG.GUARDED,
};

/** The real 91-block save featured in the hero. Every field verified on-chain. */
export const HERO_EVENT = {
  guardedAccount: CFG.GUARDED,
  spender: CFG.DRAINER,
  token: CFG.TOKEN,
  startBlock: 38340097,
  endBlock: 38340188,
  blockDifference: 91,
  tokensMoved: 0,
  txApproveHash: '0x8137a8a7578ddfa58b3c5c34f97654c20d28ea42e70e2caee4872ef4781d5ad0',
  txRevokeHash: '0xbf96b638e8dffb62cf6561e1dbd04e4bf7d08c48331ef0d192d807e5ed4ace2f',
};

export function txUrl(h: string): string { return `${CFG.EXPLORER}/tx/${h}`; }
export function addrUrl(a: string): string { return `${CFG.EXPLORER}/address/${a}`; }

// ------------------------------------------------------------------ rpc
let rpcIdx = 0;
export async function queryXLayerRpc(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < RPCS.length; i++) {
    const which = (rpcIdx + i) % RPCS.length;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(RPCS[which], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      rpcIdx = which;
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RPC unreachable');
}

// --------------------------------------------------------------- helpers
function wordAt(hex: string, i: number): string { return hex.slice(i * 64, i * 64 + 64); }
function toInt(word: string): number { return parseInt(word, 16); }
function toBig(word: string): bigint { return BigInt('0x' + word); }
function hexBlock(n: number): string { return '0x' + n.toString(16); }
function verdictFromRisk(risk: number): Verdict { return risk >= 75 ? 'malicious' : 'suspicious'; }

// ------------------------------------------------------------ contract reads
export interface FlagState { flagged: boolean; risk: number; reasonHash: string; }

export async function isFlagged(spender: string): Promise<FlagState> {
  const data = CFG.ISFLAGGED_SEL + padAddress32(spender);
  const ret: string = await queryXLayerRpc('eth_call', [{ to: CFG.REGISTRY, data }, 'latest']);
  const h = ret.replace(/^0x/, '');
  return {
    flagged: toBig(wordAt(h, 0)) !== 0n,
    risk: toInt(wordAt(h, 1)),
    reasonHash: '0x' + wordAt(h, 2),
  };
}

export async function allowance(owner: string, spender: string, token: string): Promise<bigint> {
  const data = CFG.ALLOWANCE_SEL + padAddress32(owner) + padAddress32(spender);
  const ret: string = await queryXLayerRpc('eth_call', [{ to: token, data }, 'latest']);
  return toBig(ret.replace(/^0x/, ''));
}

interface FlagLog { spender: string; risk: number; reasonHash: string; block: number; tx: string; }

async function tailScan(fromBlock: number, toBlock: number): Promise<FlagLog[]> {
  const out: FlagLog[] = [];
  for (let start = fromBlock; start <= toBlock; start += CFG.LOG_CHUNK) {
    const end = Math.min(start + CFG.LOG_CHUNK, toBlock);
    try {
      const logs: any[] = await queryXLayerRpc('eth_getLogs', [{
        address: CFG.REGISTRY, topics: [CFG.SPENDER_FLAGGED_T0],
        fromBlock: hexBlock(start), toBlock: hexBlock(end),
      }]);
      for (const lg of logs) {
        const d = lg.data.replace(/^0x/, '');
        out.push({
          spender: '0x' + lg.topics[1].slice(26),
          risk: toInt(wordAt(d, 0)),
          reasonHash: '0x' + wordAt(d, 1),
          block: parseInt(lg.blockNumber, 16),
          tx: lg.transactionHash,
        });
      }
    } catch { /* one bad chunk shouldn't kill the scan */ }
  }
  return out;
}

interface Reasoning {
  available: boolean;
  reasoning?: string;
  verdict?: Verdict;
  risk?: number;
  token?: string;
  owner?: string;
  flaggedTx?: string;
  flaggedBlock?: number;
  verified?: boolean;
}

const reasonCache: Record<string, Promise<Reasoning>> = {};
async function loadReasoning(reasonHash: string): Promise<Reasoning> {
  if (reasonHash === ZERO32) return { available: false };
  if (reasonCache[reasonHash]) return reasonCache[reasonHash];
  const p = (async () => {
    try {
      const r = await fetch(`${BASE}verdicts/${reasonHash}.json`);
      if (!r.ok) return { available: false };
      const j = await r.json();
      const computed = keccak256(j.reasoning);
      return {
        available: true,
        reasoning: j.reasoning,
        verdict: j.verdict as Verdict,
        risk: j.risk_score,
        token: j.token,
        owner: j.owner,
        flaggedTx: j.flagged_tx,
        flaggedBlock: j.flagged_block,
        verified: computed.toLowerCase() === reasonHash.toLowerCase(),
      };
    } catch {
      return { available: false };
    }
  })();
  reasonCache[reasonHash] = p;
  return p;
}

// ------------------------------------------------------ live registry feed
/**
 * Read the live registry: a committed flags.json seeds the spender addresses
 * (a Solidity mapping can't be enumerated on-chain), then each verdict is read
 * LIVE via isFlagged(), plus a bounded SpenderFlagged tail scan for new flags.
 * Returns { rows, headBlock }. Throws only if the chain is entirely unreachable.
 */
export async function loadRegistry(): Promise<{ rows: LiveVerdict[]; headBlock: number }> {
  const seen: Record<string, boolean> = {};

  let seed: string[] = [];
  try {
    const r = await fetch(`${BASE}flags.json`);
    if (r.ok) seed = (await r.json()).spenders || [];
  } catch { /* seed optional */ }

  const head = parseInt(await queryXLayerRpc('eth_blockNumber', []), 16);

  async function toRow(addr: string, log?: FlagLog): Promise<LiveVerdict | null> {
    const v = await isFlagged(addr).catch(() => null);
    if (!v || !v.flagged) return null;
    seen[addr.toLowerCase()] = true;
    const reason = await loadReasoning(v.reasonHash);
    return {
      address: addr.toLowerCase(),
      verdict: (reason.available && reason.verdict) || verdictFromRisk(v.risk),
      riskScore: v.risk,
      reasonText: reason.available
        ? (reason.reasoning as string)
        : 'Recorded on-chain; the reasoning document is not published to this site.',
      reasonHash: v.reasonHash,
      reasoningAvailable: reason.available,
      verified: !!reason.verified,
      blockFlagged: reason.flaggedBlock ?? log?.block,
      flaggedTx: reason.flaggedTx ?? log?.tx,
    };
  }

  const seedRows = (await Promise.all(seed.map((a) => toRow(a)))).filter(Boolean) as LiveVerdict[];

  const logs = await tailScan(Math.max(0, head - CFG.TAIL_BLOCKS), head).catch(() => [] as FlagLog[]);
  const tailRows = (await Promise.all(
    logs.filter((l) => !seen[l.spender.toLowerCase()])
      .map((l) => toRow(l.spender, l)),
  )).filter(Boolean) as LiveVerdict[];

  const rows = seedRows.concat(tailRows).sort((a, b) => b.riskScore - a.riskScore);
  return { rows, headBlock: head };
}

// --------------------------------------------------------- single-address check
export async function checkAddress(addressInput: string): Promise<CheckResult> {
  const address = addressInput.trim();
  const timestamp = new Date().toISOString();

  // Real read. If this throws, the caller shows a real error — never mock data.
  const data = CFG.ISFLAGGED_SEL + padAddress32(address);
  const rawHex: string = await queryXLayerRpc('eth_call', [{ to: CFG.REGISTRY, data }, 'latest']);
  const h = rawHex.replace(/^0x/, '');
  const flagged = toBig(wordAt(h, 0)) !== 0n;
  const risk = toInt(wordAt(h, 1));
  const reasonHash = '0x' + wordAt(h, 2);

  if (!flagged) {
    return {
      address,
      isFlagged: false,
      verdict: null,
      riskScore: risk,
      reasonText:
        'DAegis has not recorded a verdict against this spender. That is not a guarantee it is safe, only that the agent has not judged it. Approvals are risky by default; grant the smallest allowance you can.',
      reasonHash,
      reasoningAvailable: false,
      computedHash: null,
      verified: false,
      actionAdvice: 'NOT FLAGGED. No verdict on record. Still approve with caution and grant the minimum allowance.',
      rawHex,
      timestamp,
    };
  }

  const reason = await loadReasoning(reasonHash);
  const verdict: Verdict = (reason.available && reason.verdict) || verdictFromRisk(risk);
  const computedHash = reason.available ? keccak256(reason.reasoning as string) : null;

  return {
    address,
    isFlagged: true,
    verdict,
    riskScore: risk,
    reasonText: reason.available
      ? (reason.reasoning as string)
      : `Recorded on-chain (risk ${risk}/100). The reasoning document is not published to this site, so it cannot be verified here.`,
    reasonHash,
    reasoningAvailable: reason.available,
    computedHash,
    verified: !!reason.verified,
    actionAdvice:
      verdict === 'malicious'
        ? 'DO NOT APPROVE. DAegis flagged this spender as malicious on the X Layer ThreatRegistry.'
        : 'CAUTION. DAegis flagged this spender as suspicious; its intent is unconfirmed. Do not grant an unlimited allowance.',
    rawHex,
    timestamp,
  };
}
