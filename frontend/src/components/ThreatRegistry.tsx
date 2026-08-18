import React, { useEffect, useState } from 'react';
import { LiveVerdict, Verdict } from '../types';
import { loadRegistry, NETWORK_CONFIG, addrUrl, txUrl } from '../services/xlayerRpc';
import { ShieldAlert, ExternalLink, Search, CheckCircle, Copy, Check, ChevronDown, ChevronUp, Database, AlertTriangle } from 'lucide-react';
import { formatAddress } from '../utils/keccak';

interface ThreatRegistryProps {
  onSelectAddressToCheck: (address: string) => void;
}

const VERDICT_LABEL: Record<Verdict, string> = { malicious: 'Malicious', suspicious: 'Suspicious' };

export const ThreatRegistry: React.FC<ThreatRegistryProps> = ({ onSelectAddressToCheck }) => {
  const [verdicts, setVerdicts] = useState<LiveVerdict[]>([]);
  const [head, setHead] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<'all' | 'malicious' | 'suspicious'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadRegistry()
      .then(({ rows, headBlock }) => {
        if (!mounted) return;
        setVerdicts(rows);
        setHead(headBlock);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e?.message || 'Could not reach the X Layer RPC.');
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const malCount = verdicts.filter((v) => v.verdict === 'malicious').length;
  const susCount = verdicts.filter((v) => v.verdict === 'suspicious').length;

  const filtered = verdicts.filter((item) => {
    if (filter !== 'all' && item.verdict !== filter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      return item.address.toLowerCase().includes(q) || item.reasonText.toLowerCase().includes(q) || item.verdict.includes(q);
    }
    return true;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const toggleExpand = (address: string) => setExpandedAddress(expandedAddress === address ? null : address);

  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">

        {/* Page Header */}
        <div className="max-w-4xl xl:max-w-5xl mb-10 lg:mb-14">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa] mb-3">
            <Database strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
            <span>Threat Registry · Live On-Chain Records</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6">
            Every Spender The Agent Has Judged.
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-3xl xl:max-w-4xl">
            A public, permissionless registry. Each verdict below is read live from <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1.5 py-0.5 rounded font-mono">ThreatRegistry.isFlagged()</code> on X Layer testnet when this page loads. The risk score and 32-byte reason hash come straight from the contract, and the reasoning is verified locally in your browser against that hash.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center p-1 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] text-xs font-mono">
            <button type="button" onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${filter === 'all' ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-sm' : 'text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900'}`}>
              All ({verdicts.length})
            </button>
            <button type="button" onClick={() => setFilter('malicious')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${filter === 'malicious' ? 'bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white font-semibold' : 'text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900'}`}>
              Malicious ({malCount})
            </button>
            <button type="button" onClick={() => setFilter('suspicious')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${filter === 'suspicious' ? 'bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white font-semibold' : 'text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900'}`}>
              Suspicious ({susCount})
            </button>
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search strokeWidth={1.25} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-[#71717a]" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by address, reason…"
              className="w-full pl-9 pr-4 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] text-zinc-900 dark:text-[#f4f4f5] placeholder-[#71717a] focus:outline-none focus:border-white focus:ring-1 focus:ring-white" />
          </div>
        </div>

        {/* Verdicts List */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-zinc-400 dark:text-[#71717a] font-mono text-sm">
              Reading verdicts live from ThreatRegistry…
            </div>
          ) : error ? (
            <div className="p-8 text-center rounded-2xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-[#121215] text-red-500 font-mono text-sm inline-flex items-center justify-center gap-2 w-full">
              <AlertTriangle strokeWidth={1.25} className="h-4 w-4" /> Couldn't reach the X Layer RPC. {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] text-zinc-400 dark:text-[#71717a] font-mono text-sm">
              No matching records in ThreatRegistry.
            </div>
          ) : (
            filtered.map((item) => {
              const isExpanded = expandedAddress === item.address;
              return (
                <div key={item.address}
                  className="rounded-2xl border border-zinc-200 dark:border-[#27272a] transition-all duration-200 bg-white dark:bg-[#121215] hover:border-zinc-300 overflow-hidden">
                  <div className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">

                    {/* Left: verdict + address */}
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="p-2.5 rounded-xl shrink-0 bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-900 dark:text-white">
                        <ShieldAlert strokeWidth={1.25} className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-white">
                            {VERDICT_LABEL[item.verdict]} Spender
                          </span>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md font-semibold border bg-zinc-100 dark:bg-[#18181b] text-zinc-900 dark:text-white border-zinc-300 dark:border-[#3f3f46]">
                            Flagged
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 font-mono text-xs text-zinc-500 dark:text-[#a1a1aa]">
                          <span>{formatAddress(item.address, 8, 6)}</span>
                          <button type="button" onClick={() => handleCopy(item.address, item.address)}
                            className="text-zinc-400 dark:text-[#71717a] hover:text-zinc-900 dark:hover:text-[#f4f4f5] transition-colors" title="Copy address">
                            {copiedHash === item.address ? <Check strokeWidth={1.25} className="h-3 w-3 text-zinc-900 dark:text-white" /> : <Copy strokeWidth={1.25} className="h-3 w-3" />}
                          </button>
                          <span className="text-[#3f3f46]">·</span>
                          <a href={addrUrl(item.address)} target="_blank" rel="noopener noreferrer"
                            className="text-zinc-500 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-0.5">
                            Explorer <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Right: risk score + actions */}
                    <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-zinc-200 dark:border-[#27272a]">
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-zinc-400 dark:text-[#71717a] uppercase">Risk Score</div>
                          <div className="text-sm font-mono font-bold text-zinc-900 dark:text-white">
                            {item.riskScore}<span className="text-xs text-zinc-400 dark:text-[#71717a]">/100</span>
                          </div>
                        </div>
                        <div className="w-12 bg-zinc-200 dark:bg-[#27272a] h-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-white" style={{ width: `${item.riskScore}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onSelectAddressToCheck(item.address)}
                          className="px-3 py-1.5 rounded-lg text-xs font-mono bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white hover:bg-white hover:text-black transition-all">
                          Check in Scanner
                        </button>
                        <button type="button" onClick={() => toggleExpand(item.address)}
                          className="p-1.5 rounded-lg text-zinc-400 dark:text-[#71717a] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-[#27272a] transition-colors" aria-label="Toggle details">
                          {isExpanded ? <ChevronUp strokeWidth={1.25} className="h-4 w-4" /> : <ChevronDown strokeWidth={1.25} className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded technical inspection */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-zinc-200 dark:border-[#27272a] bg-zinc-50 dark:bg-[#09090b] text-xs">
                      <div className="mb-3">
                        <div className="text-[11px] font-mono text-zinc-400 dark:text-[#71717a] uppercase mb-1">Evaluated Security Reason</div>
                        <p className="text-zinc-700 dark:text-[#d4d4d8] leading-relaxed bg-white dark:bg-[#121215] p-3 rounded-xl border border-zinc-200 dark:border-[#27272a]">
                          {item.reasonText}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div className="p-3 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a]">
                          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 dark:text-[#71717a] mb-1">
                            <span>On-Chain Reason Hash (bytes32)</span>
                            {item.reasoningAvailable && item.verified ? (
                              <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                                <CheckCircle strokeWidth={1.25} className="h-3 w-3" /> Verified match
                              </span>
                            ) : item.reasoningAvailable ? (
                              <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                                <AlertTriangle strokeWidth={1.25} className="h-3 w-3" /> Hash mismatch
                              </span>
                            ) : (
                              <span className="text-zinc-400 dark:text-[#71717a]">reasoning not published</span>
                            )}
                          </div>
                          <div className="font-mono text-zinc-500 dark:text-[#a1a1aa] text-[11px] break-all">{item.reasonHash}</div>
                        </div>

                        <div className="p-3 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] flex flex-col justify-between">
                          <div className="text-[11px] font-mono text-zinc-400 dark:text-[#71717a] mb-1">On-Chain Record</div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.blockFlagged && (
                              <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white text-[10px] font-mono">
                                Block #{item.blockFlagged.toLocaleString()}
                              </span>
                            )}
                            {item.flaggedTx && (
                              <a href={txUrl(item.flaggedTx)} target="_blank" rel="noopener noreferrer"
                                className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-[#27272a] text-zinc-700 dark:text-[#d4d4d8] text-[10px] font-mono inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white">
                                Flagging tx <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs font-mono text-zinc-400 dark:text-[#71717a]">
          ThreatRegistry on X Layer: <code className="text-zinc-900 dark:text-white">{NETWORK_CONFIG.threatRegistryAddress}</code>
          {head !== null && <> · read live at block {head.toLocaleString()}</>}
        </div>

      </div>
    </div>
  );
};
