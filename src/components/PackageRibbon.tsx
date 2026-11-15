import React from 'react';
import type { GuestPackage } from '@/lib/requestsShared';

// Diagonal corner ribbon for Sinner / Saint stays. The parent needs `relative overflow-hidden`.
export default function PackageRibbon({ pkg, className = '' }: { pkg: GuestPackage; className?: string }) {
  if (!pkg) return null;
  const tone = pkg === 'Sinner' ? 'bg-gradient-to-r from-orange-600 to-rose-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600';
  return (
    <div className={`pointer-events-none absolute top-0 right-0 w-24 h-24 overflow-hidden z-[1] ${className}`} aria-label={`${pkg} package`}>
      <div className={`absolute top-[18px] -right-[30px] w-[130px] rotate-45 text-center text-[9px] font-black tracking-[0.2em] uppercase text-white py-1 shadow-md ${tone}`}>
        {pkg}
      </div>
    </div>
  );
}

// Small inline tag, for places without room for a ribbon.
export function PackageTag({ pkg }: { pkg: GuestPackage }) {
  if (!pkg) return null;
  const tone = pkg === 'Sinner' ? 'bg-orange-600 text-white' : 'bg-emerald-600 text-white';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${tone}`}>{pkg}</span>;
}
