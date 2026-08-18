export type NavPage = 'home' | 'registry' | 'checker' | 'how' | 'contracts' | 'about';

export type Verdict = 'malicious' | 'suspicious';

/** A live registry entry: verdict/score/hash read from ThreatRegistry on-chain,
 *  reasoning fetched from the published verdict file and keccak-verified in-browser. */
export interface LiveVerdict {
  address: string;
  verdict: Verdict;              // real label (malicious/suspicious) from the published verdict, or derived from the on-chain risk band
  riskScore: number;            // 0-100, read live from isFlagged()
  reasonText: string;           // published reasoning, or an honest "not published" notice
  reasonHash: string;           // bytes32, read live from isFlagged()
  reasoningAvailable: boolean;  // was the reasoning document published to this site?
  verified: boolean;            // keccak256(reasoning) === on-chain reasonHash (only meaningful when reasoningAvailable)
  blockFlagged?: number;        // from SpenderFlagged log or the published verdict
  flaggedTx?: string;           // from SpenderFlagged log or the published verdict
}

/** Result of checking one pasted address against the live registry. */
export interface CheckResult {
  address: string;
  isFlagged: boolean;           // did ThreatRegistry return a verdict for this address?
  verdict: Verdict | null;      // null when not flagged
  riskScore: number;            // live
  reasonText: string;           // published reasoning, or an honest notice (not flagged / not published)
  reasonHash: string;           // live (0x000…0 when not flagged)
  reasoningAvailable: boolean;
  computedHash: string | null;  // in-browser keccak of the published reasoning, or null if nothing to verify against
  verified: boolean;            // real verification result (only when reasoningAvailable)
  actionAdvice: string;         // honest guidance derived from the real verdict
  rawHex: string;               // the raw eth_call return, for the calldata inspector
  timestamp: string;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  gasToken: string;
  rpcUrl: string;
  explorerUrl: string;
  threatRegistryAddress: string;
  guardedAccountAddress: string;
}
