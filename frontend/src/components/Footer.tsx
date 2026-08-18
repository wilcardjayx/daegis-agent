import React from 'react';
import { Logo } from './Logo';
import { NETWORK_CONFIG } from '../services/xlayerRpc';
import { ExternalLink } from 'lucide-react';
import { NavPage } from '../types';

interface FooterProps {
  onNavigate?: (page: NavPage) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-zinc-50 dark:bg-[#09090b] text-zinc-500 dark:text-[#a1a1aa] border-t border-zinc-200 dark:border-[#27272a] py-12 text-xs">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-zinc-200 dark:border-[#27272a]">
          
          <div className="flex items-center gap-3">
            <div className="text-zinc-900 dark:text-white">
              <Logo size={24} />
            </div>
            <div>
              <span className="font-bold text-sm text-zinc-900 dark:text-white font-mono">DAegis</span>
              <p className="text-[11px] text-zinc-400 dark:text-[#71717a]">
                Autonomous On-Chain Approval Guardian
              </p>
            </div>
          </div>

          {/* Internal Page Nav Links */}
          {onNavigate && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-500 dark:text-[#a1a1aa]">
              <button 
                type="button" 
                onClick={() => onNavigate('home')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                Overview
              </button>
              <button 
                type="button" 
                onClick={() => onNavigate('registry')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                Threat Registry
              </button>
              <button 
                type="button" 
                onClick={() => onNavigate('checker')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                Contract Checker
              </button>
              <button 
                type="button" 
                onClick={() => onNavigate('how')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                How It Works
              </button>
              <button 
                type="button" 
                onClick={() => onNavigate('contracts')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                Contracts & API
              </button>
              <button 
                type="button" 
                onClick={() => onNavigate('about')} 
                className="hover:text-zinc-900 dark:text-white transition-colors"
              >
                About
              </button>
            </div>
          )}

          {/* External Links */}
          <div className="flex flex-wrap items-center gap-5 text-xs font-mono text-zinc-500 dark:text-zinc-400">
            <a 
              href="https://x.com/DAegis_" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.91z" />
              </svg>
              X (Twitter)
            </a>
            <a 
              href={`${NETWORK_CONFIG.explorerUrl}/address/${NETWORK_CONFIG.threatRegistryAddress}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1"
            >
              ThreatRegistry <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
            </a>
            <a 
              href={`${NETWORK_CONFIG.explorerUrl}/address/${NETWORK_CONFIG.guardedAccountAddress}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1"
            >
              GuardedAccount <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
            </a>
            <a 
              href={NETWORK_CONFIG.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1"
            >
              X Layer <ExternalLink strokeWidth={1.25} className="h-3 w-3" />
            </a>
          </div>

        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] font-mono text-zinc-400 dark:text-[#71717a]">
          <div>
            Built for <span className="text-zinc-900 dark:text-white font-medium">OKX Build-X</span> · Deployed on X Layer Testnet (Chain ID 1952)
          </div>
          <div className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] text-zinc-500 dark:text-[#a1a1aa]">
            Testnet showcase — zero real assets at risk
          </div>
        </div>

      </div>
    </footer>
  );
};
