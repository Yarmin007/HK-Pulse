import type { Metadata } from "next";
import "./globals.css"; 
import Sidebar from "@/components/Sidebar";
import { Toaster } from "react-hot-toast"; 

export const metadata: Metadata = {
  title: "HK Pulse | Coordinator Hub",
  description: "Advanced Housekeeping Management System",
  manifest: "/manifest.json", // 👈 Link the PWA Manifest here
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#FDFBFD] text-[#6D2158] font-antiqua antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          
          {/* UPDATED MAIN CONTAINER: 
              - 'ml-0' on mobile (full width)
              - 'md:ml-64' on desktop (sidebar space)
              - Added 'pt-16' on mobile to clear the hamburger button
          */}
          <main className="flex-1 ml-0 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 transition-all duration-300 w-full">
            {children}
          </main>
        </div>

        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#333',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              padding: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            },
            success: {
              style: {
                background: '#ECFDF5', 
                color: '#065F46',      
                border: '1px solid #A7F3D0'
              },
              iconTheme: { primary: '#10B981', secondary: '#ECFDF5' }
            },
            error: {
              style: {
                background: '#FFF1F2', 
                color: '#9F1239',      
                border: '1px solid #FECDD3'
              },
              iconTheme: { primary: '#E11D48', secondary: '#FFF1F2' }
            }
          }}
        />
      </body>
    </html>
  );
}