"use client";
import React from 'react';
import AdminOnly from '@/components/AdminOnly';

// Every inventory sheet (matrix, setup, store, linen, bottle, spot count): admins only.
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <AdminOnly what="Inventory">{children}</AdminOnly>;
}
