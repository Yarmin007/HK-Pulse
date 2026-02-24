"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Define which paths should hide the Sidebar and be full width
  const isPublicView = pathname?.includes('/mobile') || pathname?.includes('/water/view');

  return (
    <div className="flex min-h-screen">
      {/* Conditionally render the Sidebar */}
      {!isPublicView && <Sidebar />}
      
      {/* Conditionally apply the padding and margin so public pages take up the whole screen */}
      <main className={`flex-1 transition-all duration-300 w-full ${isPublicView ? '' : 'ml-0 md:ml-64 p-4 md:p-8 pt-20 md:pt-8'}`}>
        {children}
      </main>
    </div>
  );
}