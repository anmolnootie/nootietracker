import React from 'react';
import { PLATFORMS } from '@po-control-tower/shared';

export const CT_PLATFORMS: string[] = [...PLATFORMS];
export const platformSlug = (p: string) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const platformFromSlug = (slug: string) => CT_PLATFORMS.find((p) => platformSlug(p) === slug);

/** Logo files in public/logos (supplied by the team). Blinkit has no file yet, so it gets a brand-coloured mark; Other gets a grey chip. */
const LOGO: Record<string, { src?: string; bg?: string; fg?: string; t?: string; pad?: boolean }> = {
  Blinkit: { bg: '#F8CB46', fg: '#0C831F', t: 'blinkit' },
  Zepto: { src: '/logos/zepto.png' },
  'Swiggy Instamart': { src: '/logos/swiggy-instamart.png', pad: true },
  BigBasket: { src: '/logos/bigbasket.png', pad: true },
  Flipkart: { src: '/logos/flipkart.png', pad: true },
  Amazon: { src: '/logos/amazon.webp', pad: true },
  Supertails: { src: '/logos/supertails.jpg', pad: true },
  FirstClub: { src: '/logos/firstclub.jpg' },
  'Tata 1mg': { src: '/logos/tata-1mg.png' },
  Other: { bg: '#EEF0F3', fg: '#6B7280', t: 'O' },
};

/** Square platform mark. `size` in px. */
export const PlatformLogo: React.FC<{ p: string; size?: number; className?: string }> = ({ p, size = 36, className = '' }) => {
  const m = LOGO[p] || LOGO.Other;
  const box = `inline-flex items-center justify-center shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5 bg-white ${className}`;
  if (m.src) {
    return (
      <span className={box} style={{ width: size, height: size }}>
        <img src={m.src} alt={`${p} logo`} className={`w-full h-full object-contain ${m.pad ? 'p-[12%]' : ''}`} loading="lazy" />
      </span>
    );
  }
  return (
    <span aria-label={`${p} logo`} className={box} style={{ width: size, height: size, background: m.bg, color: m.fg }}>
      <b style={{ fontSize: Math.max(9, size * (m.t!.length > 2 ? 0.24 : 0.46)), letterSpacing: m.t!.length > 2 ? '-0.02em' : 0 }}>{m.t}</b>
    </span>
  );
};

/** Logo followed by the name on one line (never wraps under the logo). */
export const PlatformName: React.FC<{ p: string; size?: number }> = ({ p, size = 20 }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle"><PlatformLogo p={p} size={size} /><span>{p}</span></span>
);
