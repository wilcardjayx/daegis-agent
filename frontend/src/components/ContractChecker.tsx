import React, { useState, useEffect, useRef } from 'react';
import { CheckResult } from '../types';
import { checkAddress, NETWORK_CONFIG, addrUrl } from '../services/xlayerRpc';
import { isValidAddress } from '../utils/keccak';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Search, CheckCircle2, ExternalLink,
  Copy, Check, RefreshCw, Terminal, Lock, Clock, Download,
} from 'lucide-react';

interface ContractCheckerProps {
  initialAddress?: string;
}

export const ContractChecker: React.FC<ContractCheckerProps> = ({ initialAddress }) => {
  const [addressInput, setAddressInput] = useState(initialAddress || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const { history, addSearch } = useSearchHistory();

  useEffect(() => {
    if (initialAddress && isValidAddress(initialAddress)) {
      setAddressInput(initialAddress);
      executeCheck(initialAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAddress]);

  const executeCheck = async (addrToTest?: string) => {
    const target = (addrToTest || addressInput).trim();
    if (!target) { setError('Please enter a contract or spender address.'); return; }
    if (!isValidAddress(target)) {
      setError('Invalid address format. Must start with 0x and contain 40 hexadecimal characters.');
      return;
    }

    setError(null);
    setLoading(true);
    setShowHistory(false);
    setResult(null);

    try {
      // Real read against ThreatRegistry. No mock fallback: a failure is a failure.
      const res = await checkAddress(target);
      addSearch(target);
      setResult(res);
    } catch (err: any) {
      setError(`Couldn't reach the X Layer RPC to query ThreatRegistry: ${err?.message || 'network error'}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => { e.preventDefault(); executeCheck(); };
  const handleChipClick = (addr: string) => { setAddressInput(addr); setError(null); executeCheck(addr); };
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const exportPDF = async () => {
    if (!resultRef.current || !result) return;
    const prevBg = resultRef.current.style.backgroundColor;
    const dark = document.documentElement.classList.contains('dark');
    resultRef.current.style.backgroundColor = dark ? '#09090b' : '#ffffff';
    try {
      const canvas = await html2canvas(resultRef.current, { scale: 2, useCORS: true, backgroundColor: dark ? '#09090b' : '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`DAegis_Report_${result.address.substring(0, 8)}.pdf`);
    } catch (err) {
      console.error('PDF Export failed', err);
    } finally {
      resultRef.current.style.backgroundColor = prevBg;
    }
  };

  const flagged = !!result?.isFlagged;
  const statusText = !result ? '' : flagged
    ? `FLAGGED ${result.verdict === 'malicious' ? 'MALICIOUS' : 'SUSPICIOUS'} SPENDER`
    : 'NOT FLAGGED';

  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">

        {/* Page Header */}
        <div className="max-w-4xl xl:max-w-5xl mb-12 lg:mb-16">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
            <Search strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
            <span>Contract Checker · Live Verification Tool</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6">
            Check A Contract Before You Approve It.
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-3xl xl:max-w-4xl">
            Paste a contract or spender address and DAegis returns its live verdict from the on-chain registry: flagged status, risk score, and the model's reasoning, verified in your browser against the 32-byte reason hash. This is a reputation check to run before you approve a contract; it does not scan a wallet's existing approvals. No wallet connection required.
          </p>
        </div>

        {/* Checker Form Card */}
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] p-6 sm:p-8 lg:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">

          <form onSubmit={handleFormSubmit} className="space-y-4" id="contract-checker-form">
            <div className="relative">
              <label htmlFor="contract-address-input" className="block text-xs font-mono text-zinc-500 dark:text-zinc-400 uppercase mb-2">
                Contract or Spender Address (0x…)
              </label>

              <div className="relative flex items-center">
                <input id="contract-address-input" type="text" value={addressInput}
                  onChange={(e) => { setAddressInput(e.target.value); if (error) setError(null); }}
                  onFocus={() => setShowHistory(true)}
                  onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                  placeholder="0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5"
                  className="w-full pl-4 pr-32 py-3.5 text-sm font-mono rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-600 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 transition-all"
                  spellCheck={false} autoComplete="off" />

                <button type="submit" disabled={loading}
                  className="absolute right-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm">
                  {loading ? (<><RefreshCw strokeWidth={1.25} className="h-3.5 w-3.5 animate-spin" />Checking</>)
                    : (<><Search strokeWidth={1.25} className="h-3.5 w-3.5" />Check</>)}
                </button>
              </div>

              <AnimatePresence>
                {showHistory && history.length > 0 && (
                  <motion.div style={{ willChange: 'transform, opacity' }} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full mt-2 w-full z-10 bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="px-4 py-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/50 flex items-center gap-1.5">
                      <Clock strokeWidth={1.25} className="h-3 w-3" /> Recent Searches
                    </div>
                    <ul className="py-1">
                      {history.map((item) => (
                        <li key={item}>
                          <button type="button" onClick={() => handleChipClick(item)}
                            className="w-full text-left px-4 py-2.5 text-xs font-mono text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-white transition-colors">
                            {item}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <p className="text-xs font-mono text-red-500 mt-2 flex items-center gap-1.5">
                  <AlertTriangle strokeWidth={1.25} className="h-3.5 w-3.5" /> {error}
                </p>
              )}
            </div>

            {/* Quick-try chips (real contracts) */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              <span>Sample contracts:</span>
              <button type="button" onClick={() => handleChipClick('0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5')}
                className="px-2.5 py-1 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors">
                0xe9eb…F7D5 (drainer)
              </button>
              <button type="button" onClick={() => handleChipClick('0x122589dF6fC8BF65500927dbcb87906bbA715ED0')}
                className="px-2.5 py-1 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors">
                0x1225…5ED0 (router)
              </button>
            </div>
          </form>

          {/* Results */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div key="result" initial={{ opacity: 0, height: 0, scale: 0.98 }} animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.98 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div ref={resultRef} className="pb-4">

                  {/* Status banner */}
                  <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative overflow-hidden">
                    {flagged && <div className="absolute inset-0 bg-red-500/5 dark:bg-red-500/10 pointer-events-none" />}

                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`p-3 rounded-2xl shadow-sm flex items-center justify-center ${flagged ? 'bg-red-500 text-white' : 'bg-zinc-900 text-white dark:bg-white dark:text-black'}`}>
                        {flagged ? <ShieldAlert strokeWidth={1.25} className="h-6 w-6" /> : <ShieldCheck strokeWidth={1.25} className="h-6 w-6" />}
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-0.5">Threat Verdict</div>
                        <div className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">{statusText}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-zinc-950 px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative z-10">
                      <div className="text-right">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Risk Score</div>
                        <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-white leading-none mt-1">
                          {result.riskScore}<span className="text-xs text-zinc-400 dark:text-zinc-600">/100</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action guidance */}
                  <div className="mb-6 p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-semibold">
                      <Lock strokeWidth={1.25} className="h-3.5 w-3.5" /> Action Guidance
                    </div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{result.actionAdvice}</p>
                  </div>

                  {/* Reasoning + verification */}
                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">Model Reasoning &amp; Verdict Context</div>
                      <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {result.reasonText}
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                          Cryptographic On-Chain Hash Verification
                        </div>
                        {result.reasoningAvailable && result.verified ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full">
                            <CheckCircle2 strokeWidth={1.5} className="h-3.5 w-3.5" /> Verified match
                          </div>
                        ) : result.reasoningAvailable ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full">
                            <AlertTriangle strokeWidth={1.5} className="h-3.5 w-3.5" /> Hash mismatch
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 px-2.5 py-1 rounded-full">
                            Reasoning not published
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-[11px] font-mono">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 gap-2">
                          <span className="text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[9px]">On-Chain reasonHash</span>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-900 dark:text-zinc-300 break-all">{result.reasonHash}</span>
                            <button type="button" onClick={() => handleCopy(result.reasonHash, 'reasonHash')}
                              className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-800 p-1 rounded-md border border-zinc-200 dark:border-zinc-700 shadow-sm" title="Copy hash">
                              {copiedField === 'reasonHash' ? <Check strokeWidth={1.25} className="h-3 w-3 text-emerald-500" /> : <Copy strokeWidth={1.25} className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 gap-2">
                          <span className="text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[9px]">In-Browser keccak256(reasoning)</span>
                          <span className="text-zinc-900 dark:text-zinc-300 break-all">{result.computedHash ?? '— (reasoning not published to this site)'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex flex-wrap items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50 mt-4">
                      <div className="flex gap-4">
                        <button type="button" onClick={() => setShowRaw(!showRaw)} className="hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors">
                          <Terminal strokeWidth={1.25} className="h-3.5 w-3.5" /> {showRaw ? 'Hide Calldata' : 'Inspect Calldata'}
                        </button>
                        <button type="button" onClick={exportPDF} className="hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors">
                          <Download strokeWidth={1.25} className="h-3.5 w-3.5" /> Export PDF
                        </button>
                      </div>
                      <a href={addrUrl(result.address)} target="_blank" rel="noopener noreferrer"
                        className="text-zinc-900 dark:text-white underline decoration-zinc-300 dark:decoration-zinc-700 hover:decoration-zinc-900 dark:hover:decoration-white transition-colors inline-flex items-center gap-1">
                        Open on Explorer <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
                      </a>
                    </div>

                    {/* Raw calldata / return */}
                    <AnimatePresence>
                      {showRaw && (
                        <motion.div style={{ willChange: 'transform, opacity' }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="p-4 mt-4 rounded-xl bg-zinc-900 dark:bg-black border border-zinc-800 font-mono text-[11px] text-zinc-400 space-y-2 shadow-inner">
                            <div className="text-white font-semibold mb-3 border-b border-zinc-800 pb-2">// RPC eth_call — ThreatRegistry.isFlagged(address)</div>
                            <div><span className="text-zinc-500">Target:</span> <span className="text-zinc-300">{NETWORK_CONFIG.threatRegistryAddress}</span></div>
                            <div><span className="text-zinc-500">Calldata:</span> <span className="text-zinc-300 break-all">0xfef48a99{result.address.replace('0x', '').toLowerCase().padStart(64, '0')}</span></div>
                            <div><span className="text-zinc-500">Return:</span> <span className="text-zinc-300 break-all">{result.rawHex}</span></div>
                            <div><span className="text-zinc-500">Query Time:</span> <span className="text-zinc-300">{result.timestamp}</span></div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
};
