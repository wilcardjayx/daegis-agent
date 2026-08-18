import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { ThreatRegistry } from './components/ThreatRegistry';
import { ContractChecker } from './components/ContractChecker';
import { HowItWorks } from './components/HowItWorks';
import { ContractsApi } from './components/ContractsApi';
import { AboutSection } from './components/AboutSection';
import { Footer } from './components/Footer';
import { queryXLayerRpc } from './services/xlayerRpc';
import { NavPage } from './types';

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('daegis_theme');
    if (saved) return saved === 'dark';
    return true; // Default to dark mode as requested
  });

  const [activePage, setActivePage] = useState<NavPage>('home');
  const [searchTargetAddress, setSearchTargetAddress] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'connecting' | 'fallback'>('connecting');

  // Handle theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('daegis_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('daegis_theme', 'light');
    }
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', darkMode ? '#0A0A0A' : '#F5F5F7');
  }, [darkMode]);

  // Initial check of X Layer testnet connectivity
  useEffect(() => {
    let isMounted = true;
    async function checkRpc() {
      try {
        await queryXLayerRpc('eth_chainId', []);
        if (isMounted) setNetworkStatus('connected');
      } catch (err) {
        if (isMounted) setNetworkStatus('fallback');
      }
    }
    checkRpc();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleTheme = () => {
    setDarkMode(!darkMode);
  };

  const handleNavigate = (page: NavPage, initialAddress?: string) => {
    if (initialAddress) {
      setSearchTargetAddress(initialAddress);
    }
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGlobalSearch = (address: string) => {
    setSearchTargetAddress(address);
    setActivePage('checker');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen transition-colors duration-500 bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans antialiased selection:bg-zinc-200 dark:selection:bg-zinc-800">
      
      {/* Background Subtle Grid Texture */}
      <div className={`fixed inset-0 pointer-events-none transition-opacity duration-500 ${darkMode ? 'grid-bg-dark opacity-40' : 'grid-bg-light opacity-60'}`} />

      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Navigation Bar */}
        <Navbar
          darkMode={darkMode}
          onToggleTheme={handleToggleTheme}
          onSearchAddress={handleGlobalSearch}
          networkStatus={networkStatus}
          activePage={activePage}
          onNavigate={handleNavigate}
        />

        {/* Main Content */}
        <main id="top" className="flex-1 pt-24 lg:pt-28">
          {activePage === 'home' && (
            <Hero onNavigate={handleNavigate} />
          )}

          {activePage === 'registry' && (
            <ThreatRegistry onSelectAddressToCheck={handleGlobalSearch} />
          )}

          {activePage === 'checker' && (
            <ContractChecker initialAddress={searchTargetAddress} />
          )}

          {activePage === 'how' && (
            <HowItWorks />
          )}

          {activePage === 'contracts' && (
            <ContractsApi />
          )}

          {activePage === 'about' && (
            <AboutSection />
          )}
        </main>

        {/* Footer */}
        <Footer onNavigate={handleNavigate} />

      </div>

    </div>
  );
}
