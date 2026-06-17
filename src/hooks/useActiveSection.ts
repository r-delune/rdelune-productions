'use client';

import { useState, useEffect } from 'react';

export function useActiveSection(sectionIds: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        let best: string | null = null;
        let bestTop = Infinity;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const top = entry.boundingClientRect.top;
            if (top < bestTop) {
              bestTop = top;
              best = entry.target.id;
            }
          }
        }

        // Only update if we found an intersecting section
        // Otherwise keep the current active (handles gaps between sections)
        if (best) setActive(best);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}
