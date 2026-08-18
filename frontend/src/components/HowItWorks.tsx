import React from 'react';
import { Eye, BrainCircuit, ShieldAlert, Lock, Cpu, CheckCircle2, ShieldCheck, Database, Zap } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        
        {/* Page Header */}
        <div className="max-w-4xl xl:max-w-5xl mb-12 lg:mb-16">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa] mb-3">
            <Cpu strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
            <span>Architecture & Security Model</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6">
            Detect. Decide. Revoke. Unattended.
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-3xl xl:max-w-4xl">
            DAegis watches token approvals as they land, judges the spender’s intent, and — for accounts under its guard — pulls the approval before it can be exploited. One identity does all of it, and it can do only one dangerous thing: set allowance to zero.
          </p>
        </div>

        {/* 3-Step Execution Loop */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:gap-8 gap-6 mb-12 lg:mb-16">
          
          {/* Step 1: Detect */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 text-3xl font-extrabold font-mono text-[#27272a] group-hover:text-[#3f3f46] transition-colors">
              01
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center text-zinc-900 dark:text-white mb-6">
                <Eye strokeWidth={1.25} className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                1. Detect
              </h3>
              <p className="text-sm text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                A poller reads real-time <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1 py-0.5 rounded font-mono text-xs">Approval</code> event logs from X Layer testnet and immediately isolates any transaction granting an unlimited or high token allowance.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-[#27272a] text-xs font-mono text-zinc-400 dark:text-[#71717a]">
              Log: <code className="text-zinc-700 dark:text-[#d4d4d8]">Approval(owner, spender, value)</code>
            </div>
          </div>

          {/* Step 2: Decide */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 text-3xl font-extrabold font-mono text-[#27272a] group-hover:text-[#3f3f46] transition-colors">
              02
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center text-zinc-900 dark:text-white mb-6">
                <BrainCircuit strokeWidth={1.25} className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                2. Decide
              </h3>
              <p className="text-sm text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                The spender’s bytecode, creator traces, and call hierarchy are dispatched into an isolated model evaluation. Unlimited alone is never the tell — intent is. It returns a deterministic verdict and a cryptographic reason hash.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-[#27272a] text-xs font-mono text-zinc-400 dark:text-[#71717a]">
              TEE Model Output: <code className="text-zinc-700 dark:text-[#d4d4d8]">verdict, riskScore, reasonHash</code>
            </div>
          </div>

          {/* Step 3: Revoke */}
          <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8 flex flex-col justify-between hover:border-zinc-300 dark:border-[#52525b] transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 text-3xl font-extrabold font-mono text-[#27272a] group-hover:text-[#3f3f46] transition-colors">
              03
            </div>

            <div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] flex items-center justify-center text-zinc-900 dark:text-white mb-6">
                <ShieldAlert strokeWidth={1.25} className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                3. Revoke
              </h3>
              <p className="text-sm text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                If the target account is guarded and the verdict is malicious, the guardian invokes <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1 py-0.5 rounded font-mono text-xs font-semibold">revoke(spender)</code>, setting the allowance strictly to zero. The verdict is permanently recorded on <code className="text-zinc-900 dark:text-white font-mono">ThreatRegistry</code>.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-[#27272a] text-xs font-mono text-zinc-400 dark:text-[#71717a]">
              Action: <code className="text-zinc-900 dark:text-white font-semibold">GuardedAccount.revoke(spender)</code>
            </div>
          </div>

        </div>

        {/* The Asymmetry Guarantee Card */}
        <div className="rounded-2xl border border-zinc-300 dark:border-[#3f3f46] bg-zinc-100 dark:bg-[#18181b] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] mb-12">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-zinc-200 dark:bg-[#27272a] text-zinc-900 dark:text-white border border-zinc-300 dark:border-[#3f3f46] shrink-0">
                <Lock strokeWidth={1.25} className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-2">
                  The guardian key can only revoke.
                </h3>
                <p className="text-sm text-zinc-700 dark:text-[#d4d4d8] leading-relaxed max-w-3xl">
                  DAegis holds a guardian role on a <code className="text-zinc-900 dark:text-white bg-white dark:bg-[#121215] px-1.5 py-0.5 rounded font-mono">GuardedAccount</code>, but that role’s entire power is one function: set an approval to zero. It cannot move tokens, change the owner, or reassign itself. The safety isn’t a human promise — it’s the mathematical shape of the contract. The key never leaves OKX’s TEE enclave.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] text-xs font-mono text-zinc-900 dark:text-white">
              <Cpu strokeWidth={1.25} className="h-4 w-4" />
              <span>OKX TEE Agentic Enclave</span>
            </div>

          </div>
        </div>

        {/* Technical Invariant Table */}
        <div className="rounded-2xl border border-zinc-200 dark:border-[#27272a] bg-white dark:bg-[#121215] p-6 sm:p-8">
          <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-4">
            Security Invariants Enforced On-Chain
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a]">
              <div className="text-zinc-900 dark:text-white font-semibold flex items-center gap-2 mb-1">
                <CheckCircle2 strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
                <span>Invariant 1: Zero Transfer Capability</span>
              </div>
              <p className="text-zinc-500 dark:text-[#a1a1aa] leading-relaxed font-sans">
                Neither the guardian address nor the backend service possesses transfer or withdrawal rights. The smart contract has no transfer method accessible to the guardian.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a]">
              <div className="text-zinc-900 dark:text-white font-semibold flex items-center gap-2 mb-1">
                <CheckCircle2 strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
                <span>Invariant 2: Enclave Key Isolation</span>
              </div>
              <p className="text-zinc-500 dark:text-[#a1a1aa] leading-relaxed font-sans">
                Signing keys are generated inside the confidential TEE enclave and are never exported to disk, logs, or network payloads.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
