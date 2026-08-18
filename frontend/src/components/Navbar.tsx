import React, { useState } from 'react';
import { Logo } from './Logo';
import { Search, Sun, Moon, ArrowRight, X, Menu } from 'lucide-react';
import { isValidAddress } from '../utils/keccak';
import { NavPage } from '../types';

interface NavbarProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onSearchAddress: (address: string) => void;
  networkStatus: 'connected' | 'connecting' | 'fallback';
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  onToggleTheme,
  onSearchAddress,
  networkStatus,
  activePage,
  onNavigate,
}) => {
  const [navSearch, setNavSearch] = useState('');
  const [inputError, setInputError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = navSearch.trim();
    if (!clean) return;

    if (!isValidAddress(clean)) {
      setInputError(true);
      setTimeout(() => setInputError(false), 2500);
      return;
    }

    onSearchAddress(clean);
  };

  const navItems: { id: NavPage; label: string }[] = [
    { id: 'home', label: 'Overview' },
    { id: 'registry', label: 'Threat Registry' },
    { id: 'checker', label: 'Contract Checker' },
    { id: 'how', label: 'How It Works' },
    { id: 'contracts', label: 'Contracts & API' },
    { id: 'about', label: 'About' },
  ];

  return (
    <header className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none text-zinc-900 dark:text-white transition-all duration-300">
      <div className="pointer-events-auto w-full max-w-7xl 2xl:max-w-[1600px] mx-auto backdrop-blur-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/50 dark:border-zinc-800/50 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] relative">
        <div className="px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
          
          {/* Left: Brand Identity */}
        <button 
          type="button"
          onClick={() => {
            onNavigate('home');
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 group focus:outline-none rounded-lg p-1 text-left"
          id="nav-brand"
        >
          <div className="text-zinc-900 dark:text-white group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
            <Logo size={28} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base sm:text-lg tracking-tight font-mono leading-tight text-zinc-900 dark:text-white">
              DAegis
            </span>
            <span className="text-[9px] sm:text-[10px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-mono">
              On-Chain Guardian
            </span>
          </div>
        </button>

        {/* Center Navigation Links for Desktop (Liquid Glass) */}
        <nav className="hidden xl:flex items-center gap-1.5 p-1.5 rounded-full bg-zinc-100/50 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium font-mono transition-all duration-300 ${
                  isActive
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-[0_2px_10px_rgb(0,0,0,0.06)] dark:shadow-[0_2px_10px_rgb(0,0,0,0.3)] border border-zinc-200/50 dark:border-zinc-700/50'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Center Search Bar */}
        <form 
          onSubmit={handleSubmit}
          className="hidden md:flex flex-1 max-w-xs lg:max-w-sm items-center relative group"
          id="nav-search-form"
        >
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-500">
              <Search strokeWidth={1.25} className="h-3.5 w-3.5" />
            </div>
            <input
              type="text"
              value={navSearch}
              onChange={(e) => {
                setNavSearch(e.target.value);
                if (inputError) setInputError(false);
              }}
              placeholder="0x… Quick check spender"
              className={`w-full pl-9 pr-12 py-2 text-xs font-mono rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#09090b]
                ${inputError 
                  ? 'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-300 focus:ring-red-500/50' 
                  : 'bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-zinc-300 dark:focus:border-zinc-700 focus:ring-zinc-200 dark:focus:ring-zinc-800 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                }`}
              spellCheck={false}
              autoComplete="off"
            />
            {navSearch && (
              <button
                type="button"
                onClick={() => setNavSearch('')}
                className="absolute inset-y-0 right-8 pr-1 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X strokeWidth={1.25} className="h-3 w-3" />
              </button>
            )}
            <button
              type="submit"
              className="absolute inset-y-0 right-1 pr-2 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-40"
              title="Check Address"
            >
              <ArrowRight strokeWidth={1.25} className="h-3.5 w-3.5" />
            </button>
          </div>
          {inputError && (
            <span className="absolute -bottom-5 left-4 text-[10px] text-red-500 dark:text-red-400 font-mono">
              Invalid 0x address format
            </span>
          )}
        </form>

        {/* Right: Controls & Network Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Network Badge */}
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 shadow-sm"
            title="X Layer Testnet (Chain ID 1952)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline font-medium">X Layer</span>
            <span className="text-zinc-400">1952</span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            type="button"
            className="p-2 rounded-full border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#09090b] focus:ring-zinc-200 dark:focus:ring-zinc-800"
            aria-label="Toggle theme mode"
            id="theme-toggle-btn"
          >
            {darkMode ? <Sun strokeWidth={1.25} className="h-4 w-4 text-white" /> : <Moon strokeWidth={1.25} className="h-4 w-4 text-zinc-900" />}
          </button>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden p-2 rounded-full border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shadow-sm"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X strokeWidth={1.25} className="h-4 w-4" /> : <Menu strokeWidth={1.25} className="h-4 w-4" />}
          </button>
        </div>
      </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="absolute top-20 inset-x-4 pointer-events-auto max-w-7xl mx-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-2xl shadow-2xl px-4 py-4 space-y-4 xl:hidden overflow-hidden">
          {/* Mobile Search */}
          <form onSubmit={handleSubmit} className="mb-2">
            <div className="relative">
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="0x… Quick check spender"
                className="w-full pl-4 pr-10 py-2.5 text-xs font-mono rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
              />
              <button
                type="submit"
                className="absolute inset-y-0 right-2 pr-3 flex items-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <ArrowRight strokeWidth={1.25} className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Mobile Nav Links */}
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`p-3 rounded-2xl text-xs font-mono font-medium text-left transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
