import type { Metadata } from "next";
import "./globals.css"; 
import { Toaster } from "react-hot-toast"; 
import AuthGuard from "@/components/AuthGuard";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "HK Pulse | Coordinator Hub",
  description: "Advanced Housekeeping Management System",
  manifest: "/manifest.json", 
  icons: {
    icon: '/icon.svg', 
    apple: '/icon-192.png', 
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#FDFBFD] text-[#6D2158] font-antiqua antialiased">
        
        {/* Security Lock */}
        <AuthGuard>
          {/* Smart Layout Wrapper (Hides Sidebar on Public Pages) */}
          <ClientLayout>
            {children}
          </ClientLayout>
        </AuthGuard>

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