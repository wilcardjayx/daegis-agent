import React from 'react';
import { ShieldCheck, Cpu, KeyRound, Sparkles, Lock, CheckCircle2, Shield } from 'lucide-react';

export const AboutSection: React.FC = () => {
  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        
        {/* Page Header */}
        <div className="max-w-4xl xl:max-w-5xl mb-12 lg:mb-16">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa] mb-3">
            <Shield strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
            <span>Mission & System Overview</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-6">
            A Guardian That Acts, Not Just An Alarm That Rings.
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-zinc-500 dark:text-[#a1a1aa] leading-relaxed max-w-3xl xl:max-w-4xl">
            DAegis was designed from first principles to solve the irreversible latency gap in Web3 security. While traditional blocklists notify users hours after an exploit, DAegis intervenes at the opcode level before tokens move.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          
          {/* Left Column: Architecture Specs */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a] text-xs font-mono text-zinc-500 dark:text-[#a1a1aa] space-y-3">
              <div className="text-zinc-900 dark:text-white font-semibold text-sm mb-2">// Autonomous Verification Parameters</div>
              
              <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-[#27272a]">
                <span className="text-zinc-400 dark:text-[#71717a]">Confidential Runtime:</span>
                <span className="text-zinc-900 dark:text-white font-semibold">OKX TEE Agentic Enclave</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-[#27272a]">
                <span className="text-zinc-400 dark:text-[#71717a]">Primary Network:</span>
                <span className="text-zinc-900 dark:text-white font-semibold">X Layer Testnet (Chain ID 1952)</span>
              </div>
              
              <div className="flex justify-between py-2 border-b border-zinc-200 dark:border-[#27272a]">
                <span className="text-zinc-400 dark:text-[#71717a]">Intervention Speed:</span>
                <span className="text-zinc-900 dark:text-white font-semibold">91 Blocks (~91s)</span>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-zinc-400 dark:text-[#71717a]">Attestation Type:</span>
                <span className="text-zinc-900 dark:text-white font-semibold">Hardware Keccak Digest</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-100 dark:bg-[#18181b] border border-zinc-300 dark:border-[#3f3f46]">
              <div className="text-xs font-mono text-zinc-900 dark:text-white font-semibold uppercase mb-2 flex items-center gap-1.5">
                <CheckCircle2 strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" /> Zero Asset Delegation
              </div>
              <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                Users never surrender control of their wallets or seed phrases. The guardian role is an on-chain smart contract authority restricted purely to <code className="text-zinc-900 dark:text-white font-mono">approve(spender, 0)</code>.
              </p>
            </div>
          </div>

          {/* Right Column: Narrative & Principles */}
          <div className="lg:col-span-7 space-y-6 text-sm sm:text-base text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
            <p>
              Most approval tools merely scan and leave you to revoke by hand after the damage is done, or ask for account delegations broad enough to move your funds. DAegis does neither. It watches token approvals as they land, evaluates bytecode intent with an isolated AI model rather than static blocklists, and where it holds a guardian role, it revokes the dangerous approval itself — automatically, within seconds, with a power narrow enough to be safe by construction.
            </p>

            <p>
              The entire autonomous loop operates through a single <strong className="text-zinc-900 dark:text-white">OKX TEE Agentic Wallet</strong>: it writes threat verdicts to the immutable <code className="text-zinc-900 dark:text-white bg-zinc-100 dark:bg-[#18181b] px-1.5 py-0.5 rounded font-mono text-xs">ThreatRegistry</code> and executes on-chain revocations, holding no private keys on any untrusted host machine. What you see across DAegis is real, verified work on X Layer testnet.
            </p>

            {/* 2 Core Principles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              
              <div className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a]">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-semibold text-sm mb-2">
                  <KeyRound strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
                  <span>Narrow Guardian Authority</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                  The guardian role is restricted solely to setting approvals to zero. It possesses zero capability to transfer or redirect tokens.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-[#121215] border border-zinc-200 dark:border-[#27272a]">
                <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-semibold text-sm mb-2">
                  <Cpu strokeWidth={1.25} className="h-4 w-4 text-zinc-900 dark:text-white" />
                  <span>Hardware TEE Isolation</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] leading-relaxed">
                  Execution and cryptographic key signing occur inside hardware-attested Trusted Execution Environments.
                </p>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

