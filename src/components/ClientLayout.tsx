"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

interface ClientLayoutProps {
  children: React.ReactNode;
  farumaClass?: string;
}

export default function ClientLayout({ children, farumaClass }: ClientLayoutProps) {
  const pathname = usePathname();
  const isAuthOrPrintRoute =
    pathname?.startsWith("/login") || pathname?.startsWith("/print");

  return (
    <div className={`min-h-screen ${farumaClass || ""}`}>
      {!isAuthOrPrintRoute && <Sidebar />}
      <main className={!isAuthOrPrintRoute ? "md:ml-64" : ""}>
        {children}
      </main>
    </div>
  );
}