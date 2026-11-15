"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import AdminOnly from '@/components/AdminOnly';

// Allocations, Live Board, Special Villas, House Use: admins only.
// The final Allocation Sheet stays open to everyone.
export default function AllocationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/allocation/sheet')) return <>{children}</>;
  return <AdminOnly what="Allocation planning">{children}</AdminOnly>;
}
