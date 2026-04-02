'use client';

import { useState, useRef, useEffect, type ComponentType } from 'react';
import Link from 'next/link';
import { useClickOutside } from '@/app/hooks';

type DropdownMenuItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  show?: boolean;
};

type DropdownMenuProps = {
  items: DropdownMenuItem[];
};

export function DropdownMenu({ items }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsOpen(false), isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const visibleItems = items.filter((item) => item.show !== false);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition"
        aria-label="더보기"
        aria-expanded={isOpen}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 min-w-[160px] rounded-xl border border-white/10 bg-slate-900 shadow-xl shadow-black/20 z-50 py-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const className =
              'flex w-full items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors';

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={className}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                className={className}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
