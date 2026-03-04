"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Removed '/mobile' from here so the Tasks page gets the standard Sidebar
  const isPublicView = 
      pathname?.includes('/water/view') || 
      pathname?.includes('/minibar/finance');

  return (
    <div className="flex min-h-screen">
      {!isPublicView && <Sidebar />}
      
      <main className={`flex-1 transition-all duration-300 w-full ${isPublicView ? '' : 'ml-0 md:ml-64 p-4 md:p-8 pt-20 md:pt-8'}`}>
        {children}
      </main>
    </div>
  );
}