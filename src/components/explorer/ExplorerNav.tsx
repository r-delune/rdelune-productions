'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';

const SOCIAL_LINKS = [
  {
    href: 'https://rdelune.bandcamp.com',
    label: 'Open rdelune on Bandcamp',
    title: 'Bandcamp',
    color: 'rgba(98, 172, 205, 0.95)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M99.2 332.8h200.4l113.2-153.6H212.4L99.2 332.8Z" />
      </svg>
    ),
  },
  {
    href: 'https://soundcloud.com/rdelune',
    label: 'Open rdelune on SoundCloud',
    title: 'SoundCloud',
    color: 'rgba(255, 141, 74, 0.95)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.6 7.2c.38-.15.8-.24 1.24-.24 1.78 0 3.26 1.32 3.5 3.04a3.06 3.06 0 0 1 1.27-.28A3.39 3.39 0 0 1 19 13.1a3.39 3.39 0 0 1-3.39 3.39H8.82V7.53c.23-.13.49-.24.78-.33Zm-2.26.98c.27-.19.56-.36.86-.5v8.81h-.86V8.18Zm-1.42 1.56c.22-.33.48-.65.78-.94v7.69h-.78V9.74Zm-1.31 2.23c.15-.49.36-.97.64-1.4v5.92h-.64v-4.52Zm-1.24 1.2c.17-.18.38-.33.62-.42v3.74h-.38A2.12 2.12 0 0 1 1.5 14.38c0-.48.16-.9.43-1.25v3.2h.57v-3.68c.18-.06.37-.09.57-.09h.3v.61Z" />
      </svg>
    ),
  },
  {
    href: 'https://www.mixcloud.com/rdelune/',
    label: 'Open rdelune on Mixcloud',
    title: 'Mixcloud',
    color: 'rgba(126, 182, 232, 0.95)',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.4 15.98a3.9 3.9 0 1 1 1.18-7.62 5.72 5.72 0 0 1 10.73 2.29 2.68 2.68 0 0 1-.58 5.33h-3.26a4.6 4.6 0 0 0-8.07 0Zm3.86-1.95a2.47 2.47 0 0 1 2.31 1.6h-4.6a2.47 2.47 0 0 1 2.29-1.6Zm0-1.58a4.08 4.08 0 0 0-3.82 2.64H7.4a2.31 2.31 0 1 1 1.3-4.21l.9.62.23-1.07a4.14 4.14 0 0 1 8.16.79v.78h.78a1.1 1.1 0 0 1 0 2.19h-2.34a4.08 4.08 0 0 0-5.17-1.74Z" />
      </svg>
    ),
  },
  {
    href: 'https://www.instagram.com/rdelune/',
    label: 'Open rdelune on Instagram',
    title: 'Instagram',
    color: 'rgba(219, 112, 178, 0.95)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.7" />
        <path d="M17.3 6.8h.01" />
      </svg>
    ),
  },
];

interface ExplorerNavProps {
  isPlaying?: boolean;
}

export default function ExplorerNav({ isPlaying = false }: ExplorerNavProps) {
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isPlaying) {
      timerRef.current = setTimeout(() => setHidden(true), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setHidden(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    resetTimer();
    const events = ['mousemove', 'touchstart', 'click'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, resetTimer]);

  return (
    <nav
      className="fixed right-5 top-4 z-20 hidden items-center gap-2 lg:flex"
      style={{
        opacity: hidden ? 0.05 : 1,
        transition: hidden ? 'opacity 1.5s ease' : 'opacity 0.3s ease',
        pointerEvents: hidden ? 'none' : undefined,
      }}
      aria-label="rdelune links"
    >
      <Link
        href="/"
        className="explorer-top-link flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-200"
        style={{ borderColor: 'var(--explorer-now-playing-border)', background: 'var(--explorer-control-surface-strong)', color: 'rgba(225, 235, 255, 0.98)' }}
        aria-label="Open rdelune home"
        title="rdelune"
      >
        <Logo className="h-4 w-4" />
      </Link>
      <div className="explorer-nav-pill">
        {SOCIAL_LINKS.map((link, index) => (
          <div key={link.href} className="flex items-center">
            {index > 0 ? <span className="explorer-nav-pill-divider" aria-hidden="true" /> : null}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-top-link flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200"
              style={{ color: link.color }}
              aria-label={link.label}
              title={link.title}
            >
              {link.icon}
            </a>
          </div>
        ))}
      </div>
    </nav>
  );
}
