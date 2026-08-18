import React, { useState, useEffect } from 'react';
import { HERO_EVENT, NETWORK_CONFIG, txUrl, allowance } from '../services/xlayerRpc';
import { ShieldAlert, ShieldCheck, ArrowRight, ExternalLink, CheckCircle2, Clock, Zap, Search, Database, Cpu, Lock } from 'lucide-react';
import { formatAddress } from '../utils/keccak';
import { NavPage } from '../types';

interface HeroProps {
  onNavigate: (page: NavPage, initialSearch?: string) => void;
}

export const Hero: React.FC<HeroProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'raw'>('visual');

  // Live "still zero" allowance: read the drainer's current allowance on the
  // guarded account. Not static — if the RPC is unreachable we say so rather
  // than assert a value.
  const [allowanceText, setAllowanceText] = useState('…');
  useEffect(() => {
    let mounted = true;
    allowance(HERO_EVENT.guardedAccount, HERO_EVENT.spender, HERO_EVENT.token)
      .then((a) => { if (mounted) setAllowanceText(a.toString()); })
      .catch(() => { if (mounted) setAllowanceText('unavailable'); });
    return () => { mounted = false; };
  }, []);

  return (
    <section className="relative pt-8 pb-16 md:pt-14 md:pb-24 overflow-hidden">
      
      {/* Background Subtle Ash Radial Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 relative">
        
        {/* Eyebrow badge */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border bg-zinc-100 dark:bg-[#18181b] border-zinc-300 dark:border-[#3f3f46] text-zinc-900 dark:text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Proven on-chain · X Layer testnet
          </span>
          <span className="text-xs font-mono text-zinc-400 dark:text-[#71717a] hidden sm:inline">
            Chain ID: {NETWORK_CONFIG.chainId}
          </span>
        </div>

        {/* Hero Title & Lede */}
        <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mb-8 lg:mb-12 2xl:mb-16">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl xl:text-[5rem] 2xl:text-[6rem] font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6 lg:mb-8 leading-[1.05]">
            The Drain <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#d4d4d8] to-[#71717a]">Never Happened.</span>
          </h1>
          <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl 2xl:leading-relaxed text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-3xl xl:max-w-4xl 2xl:max-w-5xl">
            A malicious contract obtained an unlimited allowance on a guarded account. DAegis’s autonomous guardian detected the approval log, evaluated the spender’s intent in an OKX TEE enclave, and revoked it <strong className="text-zinc-900 dark:text-white font-semibold">91 blocks later</strong> — before a single token moved.
          </p>
        </div>

        {/* Action Buttons Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          <button
            type="button"
            onClick={() => onNavigate('checker')}
            className="px-6 py-3 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all inline-flex items-center gap-2 shadow-[0_4px_14px_0_rgba(0,0,0,0.1)] dark:shadow-[0_4px_14px_0_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 dark:focus:ring-white"
          >
            Check a contract
            <ArrowRight strokeWidth={1.25} className="h-4 w-4" />
          </button>
          
          <button
            type="button"
            onClick={() => onNavigate('registry')}
            className="px-6 py-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors inline-flex items-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-200 dark:focus:ring-zinc-800"
          >
            Open Threat Registry
          </button>

          <button
            type="button"
            onClick={() => onNavigate('how')}
            className="px-6 py-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-600 dark:text-zinc-400 font-mono text-xs hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-200 dark:focus:ring-zinc-800"
          >
            How it works <ArrowRight strokeWidth={1.25} className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Timeline Ledger Card */}
        <div className="rounded-2xl lg:rounded-3xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215]/90 p-6 sm:p-8 lg:p-10 backdrop-blur-sm shadow-2xl relative overflow-hidden mb-16 xl:mb-20">
          
          {/* Card Top Meta */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-[#27272a]">
            <div>
              <div className="text-xs font-mono text-zinc-400 dark:text-[#71717a] uppercase tracking-wider">
                Autonomous Intervention Proof
              </div>
              <div className="text-sm font-medium text-zinc-900 dark:text-[#f4f4f5] mt-0.5">
                Guarded Account: <span className="font-mono text-zinc-900 dark:text-white font-semibold">{formatAddress(HERO_EVENT.guardedAccount, 8, 6)}</span>
              </div>
            </div>

            {/* Visual vs Raw toggle */}
            <div className="flex items-center p-0.5 rounded-lg border border-zinc-200 dark:border-[#27272a] bg-zinc-100 dark:bg-[#18181b] text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('visual')}
                className={`px-3 py-1 rounded-md transition-colors ${activeTab === 'visual' ? 'bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white font-medium' : 'text-zinc-400 dark:text-[#71717a] hover:text-zinc-500 dark:text-[#a1a1aa]'}`}
              >
                Visual Flow
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('raw')}
                className={`px-3 py-1 rounded-md transition-colors ${activeTab === 'raw' ? 'bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white font-medium' : 'text-zinc-400 dark:text-[#71717a] hover:text-zinc-500 dark:text-[#a1a1aa]'}`}
              >
                On-Chain Data
              </button>
            </div>
          </div>

          {activeTab === 'visual' ? (
            /* Visual Timeline Flow */
            <div className="py-6 sm:py-8">
              <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
                
                {/* Step 1: Approval Landed */}
                <div className="md:col-span-4 rounded-xl border border-zinc-300 dark:border-[#3f3f46] bg-zinc-100 dark:bg-[#18181b] p-4 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white">
                      <ShieldAlert strokeWidth={1.25} className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-700 dark:text-[#d4d4d8]">
                      Approval Landed
                    </span>
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-900 dark:text-white flex items-center justify-between">
                    <span>Block 38,340,097</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-1.5 leading-relaxed">
                    Unlimited allowance granted to spender <span className="font-mono text-zinc-900 dark:text-white underline">{formatAddress(HERO_EVENT.spender)}</span> flagged by DAegis threat heuristics.
                  </p>
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-[11px] font-mono text-zinc-400 dark:text-[#71717a]">
                    <span>Allowance: MaxUint256</span>
                    <a
                      href={txUrl(HERO_EVENT.txApproveHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-900 dark:text-white hover:underline inline-flex items-center gap-1"
                    >
                      Approve tx <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Center Gap: The 91 Blocks Autonomous Window */}
                <div className="md:col-span-3 flex flex-col items-center justify-center py-2 md:py-0 px-2 text-center">
                  <div className="w-full flex items-center justify-center gap-2 mb-1">
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#52525b] to-white" />
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-zinc-900 text-white dark:bg-white dark:text-black shrink-0 shadow-sm">
                      91 BLOCKS
                    </span>
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-white via-[#52525b] to-transparent" />
                  </div>
                  <span className="text-xs text-zinc-700 dark:text-[#d4d4d8] font-mono flex items-center gap-1 mt-1 font-semibold">
                    <Clock strokeWidth={1.25} className="h-3.5 w-3.5 text-zinc-900 dark:text-white" /> ~91s autonomous loop
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-[#71717a] mt-0.5">
                    TEE bytecode analysis & consensus
                  </span>
                </div>

                {/* Step 2: Guardian Revoked */}
                <div className="md:col-span-4 rounded-xl border border-zinc-300 dark:border-[#3f3f46] bg-zinc-100 dark:bg-[#18181b] p-4 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white">
                      <ShieldCheck strokeWidth={1.25} className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
                      Guardian Revoked
                    </span>
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-900 dark:text-white flex items-center justify-between">
                    <span>Block 38,340,188</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-1.5 leading-relaxed">
                    OKX TEE Agentic Wallet executed narrow <code className="text-zinc-900 dark:text-white font-mono font-semibold">revoke(spender)</code> on GuardedAccount, setting allowance to zero.
                  </p>
                  <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-[#27272a] flex items-center justify-between text-[11px] font-mono text-zinc-400 dark:text-[#71717a]">
                    <span className="text-zinc-900 dark:text-white font-semibold">Allowance: 0</span>
                    <a
                      href={txUrl(HERO_EVENT.txRevokeHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-900 dark:text-white hover:underline inline-flex items-center gap-1"
                    >
                      Revoke tx <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
                    </a>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            /* Raw On-Chain Technical Proof */
            <div className="py-6 font-mono text-xs text-zinc-500 dark:text-[#a1a1aa] space-y-3">
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-[#27272a] space-y-2">
                <div className="text-zinc-900 dark:text-white font-semibold">// Live Verification Parameters (X Layer Testnet)</div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-[#27272a]/60">
                  <span className="text-zinc-400 dark:text-[#71717a]">Network RPC:</span>
                  <span className="text-zinc-900 dark:text-[#f4f4f5]">{NETWORK_CONFIG.rpcUrl}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-[#27272a]/60">
                  <span className="text-zinc-400 dark:text-[#71717a]">Approval Block:</span>
                  <span className="text-zinc-900 dark:text-white font-semibold">{HERO_EVENT.startBlock}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-[#27272a]/60">
                  <span className="text-zinc-400 dark:text-[#71717a]">Revocation Block:</span>
                  <span className="text-zinc-900 dark:text-white font-semibold">{HERO_EVENT.endBlock} (Δ = {HERO_EVENT.blockDifference} blocks)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-[#27272a]/60">
                  <span className="text-zinc-400 dark:text-[#71717a]">Threat Registry:</span>
                  <span className="text-zinc-900 dark:text-white">{NETWORK_CONFIG.threatRegistryAddress}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400 dark:text-[#71717a]">Enclave Signer:</span>
                  <span className="text-zinc-900 dark:text-[#f4f4f5]">OKX TEE Agentic Key (zero external transfer permissions)</span>
                </div>
              </div>
            </div>
          )}

          {/* Outcome Bar */}
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-[#27272a] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-100 dark:bg-[#18181b] p-4 rounded-xl border border-zinc-200 dark:border-[#27272a]">
            <div className="flex items-center gap-3">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono text-zinc-900 dark:text-white">
                0
              </span>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-[#f4f4f5]">
                  tokens moved.
                </div>
                <div className="text-xs text-zinc-500 dark:text-[#a1a1aa]">
                  Spender’s allowance on that guarded account is <strong className="font-mono text-zinc-900 dark:text-white">{allowanceText}</strong> right now <span className="text-[10px] text-zinc-400 dark:text-[#71717a]">(read live)</span>.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-zinc-900 dark:text-white bg-zinc-200 dark:bg-[#27272a] px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-[#3f3f46]">
              <CheckCircle2 strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
              <span>Verified On-Chain</span>
            </div>
          </div>

        </div>

        {/* Feature Cards Grid (Overview of other dedicated pages) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          
          <div 
            onClick={() => onNavigate('registry')}
            className="cursor-pointer rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 hover:border-white transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-900 dark:text-white">
                <Database strokeWidth={1.25} className="h-5 w-5" />
              </div>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">Threat Registry</h3>
            <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
              Public on-chain verdicts for tested spenders and routers, with cryptographic reason hashes.
            </p>
            <span className="text-xs font-mono text-zinc-900 dark:text-white underline group-hover:opacity-80">
              Browse the live registry
            </span>
          </div>

          <div 
            onClick={() => onNavigate('checker')}
            className="cursor-pointer rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 hover:border-white transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-900 dark:text-white">
                <Search strokeWidth={1.25} className="h-5 w-5" />
              </div>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">Contract Checker</h3>
            <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
              Test any address live via JSON-RPC eth_call and verify Keccak-256 integrity in-browser.
            </p>
            <span className="text-xs font-mono text-zinc-900 dark:text-white underline group-hover:opacity-80">
              Launch Scanner
            </span>
          </div>

          <div 
            onClick={() => onNavigate('how')}
            className="cursor-pointer rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 hover:border-white transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-900 dark:text-white">
                <Cpu strokeWidth={1.25} className="h-5 w-5" />
              </div>
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-2">How It Works</h3>
            <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed mb-4">
              Explore the 3-step loop (*Detect, Decide, Revoke*) and the OKX TEE asymmetry guarantee.
            </p>
            <span className="text-xs font-mono text-zinc-900 dark:text-white underline group-hover:opacity-80">
              Read Security Model
            </span>
          </div>

        </div>

      </div>
    </section>
  );
};

