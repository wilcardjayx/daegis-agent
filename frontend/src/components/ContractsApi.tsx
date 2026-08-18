import React, { useState } from 'react';
import { NETWORK_CONFIG } from '../services/xlayerRpc';
import { queryXLayerRpc } from '../services/xlayerRpc';
import { Copy, Check, ExternalLink, Play, Terminal, Code2, Database, ShieldCheck } from 'lucide-react';
import { formatAddress } from '../utils/keccak';

export const ContractsApi: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedAddr, setSelectedAddr] = useState('0xe9eb89da7a2df4bd1a644d737baeff1dde87f7d5');
  const [rpcResponse, setRpcResponse] = useState<string | null>(null);
  const [loadingRpc, setLoadingRpc] = useState(false);

  const calldata = `0xfef48a99000000000000000000000000${selectedAddr.replace(/^0x/i, '').toLowerCase().padStart(40, '0')}`;

  const curlSnippet = `curl -s ${NETWORK_CONFIG.rpcUrl} \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
    "to":"${NETWORK_CONFIG.threatRegistryAddress}",
    "data":"${calldata}"
  },"latest"]}'
# Returns ABI tuple: (bool flagged, uint8 riskScore, bytes32 reasonHash)`;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunLiveRpc = async () => {
    setLoadingRpc(true);
    setRpcResponse(null);
    try {
      const res = await queryXLayerRpc('eth_call', [
        {
          to: NETWORK_CONFIG.threatRegistryAddress,
          data: calldata,
        },
        'latest',
      ]);
      setRpcResponse(JSON.stringify({ jsonrpc: '2.0', id: 1, result: res }, null, 2));
    } catch (err: any) {
      setRpcResponse(JSON.stringify({ error: err.message || 'RPC Query failed' }, null, 2));
    } finally {
      setLoadingRpc(false);
    }
  };

  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        
        {/* Page Header */}
        <div className="max-w-4xl xl:max-w-5xl mb-12 lg:mb-16">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa] mb-3">
            <Code2 strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
            <span>Developer Reference & RPC Console</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6">
            Open, Verified, Free To Read.
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-3xl xl:max-w-4xl">
            The threat registry is public on-chain infrastructure. Any Web3 application, wallet, or dApp can query it permissionlessly via standard JSON-RPC without API keys, accounts, or rate limits.
          </p>
        </div>

        {/* 3 Contract Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:gap-8 gap-6 mb-12 lg:mb-14">
          
          {/* Card 1: ThreatRegistry */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-zinc-400 dark:text-[#71717a] uppercase">Contract</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white">
                  Registry
                </span>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">ThreatRegistry</h3>
              <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
                The permanent verdict record. <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1 py-0.5 rounded font-mono">isFlagged(address)</code> returns threat status, risk score, and reason hash.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-900 dark:text-[#f4f4f5]">{formatAddress(NETWORK_CONFIG.threatRegistryAddress, 8, 6)}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(NETWORK_CONFIG.threatRegistryAddress, 'reg-addr')}
                  className="text-zinc-400 dark:text-[#71717a] hover:text-zinc-900 dark:text-white"
                  title="Copy address"
                >
                  {copiedKey === 'reg-addr' ? <Check strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-900 dark:text-white" /> : <Copy strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-400 dark:text-[#71717a]" />}
                </button>
                <a
                  href={`${NETWORK_CONFIG.explorerUrl}/address/${NETWORK_CONFIG.threatRegistryAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:text-white inline-flex items-center gap-0.5"
                >
                  <ExternalLink strokeWidth={1.25} className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: GuardedAccount */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-zinc-400 dark:text-[#71717a] uppercase">Contract</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white">
                  Guarded
                </span>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">GuardedAccount</h3>
              <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
                The smart contract account under DAegis guard. Guardian’s strictly constrained power is: <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1 py-0.5 rounded font-mono">revoke(spender)</code>.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-900 dark:text-[#f4f4f5]">{formatAddress(NETWORK_CONFIG.guardedAccountAddress, 8, 6)}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(NETWORK_CONFIG.guardedAccountAddress, 'guard-addr')}
                  className="text-zinc-400 dark:text-[#71717a] hover:text-zinc-900 dark:text-white"
                  title="Copy address"
                >
                  {copiedKey === 'guard-addr' ? <Check strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-900 dark:text-white" /> : <Copy strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-400 dark:text-[#71717a]" />}
                </button>
                <a
                  href={`${NETWORK_CONFIG.explorerUrl}/address/${NETWORK_CONFIG.guardedAccountAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:text-white inline-flex items-center gap-0.5"
                >
                  <ExternalLink strokeWidth={1.25} className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Card 3: Network */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-zinc-400 dark:text-[#71717a] uppercase">Network</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white">
                  Chain 1952
                </span>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">X Layer Testnet</h3>
              <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
                ZK-powered Layer 2 testnet with native OKB gas token. High throughput and instant cryptographic state finality.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400 dark:text-[#71717a]">RPC: <span className="text-zinc-900 dark:text-[#f4f4f5]">testrpc.xlayer.tech</span></span>
              <a
                href={NETWORK_CONFIG.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:text-white inline-flex items-center gap-0.5"
              >
                Explorer <ExternalLink strokeWidth={1.25} className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

        </div>

        {/* Live cURL and RPC Interactive Snippet */}
        <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-[#27272a] mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                <Terminal strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
                <span>Direct JSON-RPC Query</span>
              </div>
              <p className="text-xs text-zinc-400 dark:text-[#71717a] font-mono mt-0.5">
                Execute directly in your terminal or trigger the live RPC call below
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRunLiveRpc}
                disabled={loadingRpc}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold text-xs hover:bg-[#e4e4e7] transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                <Play strokeWidth={1.25} className={`h-3.5 w-3.5 ${loadingRpc ? 'animate-spin' : ''}`} />
                {loadingRpc ? 'Executing…' : 'Execute eth_call'}
              </button>

              <button
                type="button"
                onClick={() => handleCopy(curlSnippet, 'curl')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-700 dark:text-[#d4d4d8] text-xs font-mono hover:bg-zinc-200 dark:bg-[#27272a] hover:text-zinc-900 dark:text-white transition-colors flex items-center gap-1.5"
              >
                {copiedKey === 'curl' ? <Check strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-900 dark:text-white" /> : <Copy strokeWidth={1.25} className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'curl' ? 'Copied' : 'Copy cURL'}</span>
              </button>
            </div>
          </div>

          {/* cURL Code Box */}
          <pre className="p-4 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-[#27272a] font-mono text-xs text-zinc-700 dark:text-[#d4d4d8] overflow-x-auto leading-relaxed">
            <code>{curlSnippet}</code>
          </pre>

          {/* Live RPC Response output if executed */}
          {rpcResponse && (
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-[#27272a]">
              <div className="text-xs font-mono text-zinc-900 dark:text-white font-semibold mb-2">
                // Live Node Response from testrpc.xlayer.tech/terigon
              </div>
              <pre className="p-4 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-[#27272a] font-mono text-xs text-zinc-900 dark:text-white overflow-x-auto">
                <code>{rpcResponse}</code>
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
