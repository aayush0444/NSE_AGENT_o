import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useState } from 'react';

// Built-in SVG Icon for Chevron
const ChevronDown = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

export default function Navbar({ user }) {
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Defensive check for user object
  if (!user) return null;

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  const tabs = [
    { to: '/dashboard', label: 'Live Feed' },
    { to: '/watchlist', label: 'Watchlist' },
  ];

  return (
    <nav className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-6 shadow-sm">
      <div className="flex items-center gap-8">
        <div className="flex flex-col">
          <span className="font-sans text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Fin<span className="text-[var(--color-accent-primary)]">site</span>
          </span>
          <span className="font-mono text-[10px] tracking-widest text-[var(--color-text-muted)]">
            NSE / BSE · REG. 30
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-1">
        {tabs.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`rounded-md px-4 py-2 font-sans text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-[var(--color-accent-primary)] text-[var(--color-bg-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 font-sans text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          >
            <span className="max-w-[150px] truncate">{user.email || 'User'}</span>
            <ChevronDown className={`transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-[var(--color-border-primary)]">
                <p className="font-sans text-xs text-[var(--color-text-muted)]">Logged in as</p>
                <p className="font-sans text-sm font-medium text-[var(--color-text-primary)] truncate">
                  {user.email}
                </p>
              </div>
              <button
                onClick={() => {
                  handleLogout();
                  setUserMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left font-sans text-sm text-[var(--color-error)] hover:bg-[var(--color-bg-hover)] transition-colors rounded-b-lg"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
