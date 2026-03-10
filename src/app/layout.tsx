import type { Metadata, Viewport } from "next";
import "./globals.css"; 
import { Toaster } from "react-hot-toast"; 
import AuthGuard from "@/components/AuthGuard";
import ClientLayout from "@/components/ClientLayout";
import { ConfirmProvider } from "@/components/ConfirmProvider";

export const metadata: Metadata = {
  title: "HK Pulse | Coordinator Hub",
  description: "Advanced Housekeeping Management System",
  manifest: "/manifest.json", 
  icons: {
    icon: '/icon.svg', 
    apple: '/icon-192.png', 
  },
};

// --- NATIVE MOBILE ZOOM LOCK ---
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
          {/* Global Confirm Modal Provider */}
          <ConfirmProvider>
            {/* Smart Layout Wrapper (Hides Sidebar on Public Pages) */}
            <ClientLayout>
              {children}
            </ClientLayout>
          </ConfirmProvider>
        </AuthGuard>

        {/* Global Toast Configuration */}
        <Toaster 
          position="top-center"
          containerStyle={{
            top: 'max(env(safe-area-inset-top, 20px), 20px)' // Safely pushes it down on iPhones
          }}
          toastOptions={{
            style: {
              background: '#333',
              color: '#fff',
              borderRadius: '16px',
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '16px 20px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
            },
            success: {
              style: {
                background: '#ECFDF5', 
                color: '#047857',      
                border: '2px solid #A7F3D0'
              },
              iconTheme: { primary: '#10B981', secondary: '#ECFDF5' }
            },
            error: {
              style: {
                background: '#FFF1F2', 
                color: '#BE123C',      
                border: '2px solid #FECDD3'
              },
              iconTheme: { primary: '#E11D48', secondary: '#FFF1F2' }
            }
          }}
        />
      </body>
    </html>
  );
}