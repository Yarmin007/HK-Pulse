import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import AuthGuard from "@/components/AuthGuard";
import { ConfirmProvider } from "@/components/ConfirmProvider";

// Setup Faruma Font (Maldivian/Thaana Script)
const faruma = localFont({
  src: [
    {
      path: "../../public/fonts/Faruma.ttf",
      weight: "400",
      style: "normal",
    }
  ],
  variable: "--font-faruma",
});

export const metadata: Metadata = {
  title: "HK PULSE - Six Senses Laamu",
  description: "Housekeeping Operations Management System",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#FDFBFD] text-[#6D2158] font-antiqua antialiased">
        
        {/* Security Lock */}
        <AuthGuard>
          {/* Global Confirmation Modal Context */}
          <ConfirmProvider>
            {/* Dynamic UI Wrapper (Handles Sidebar & Margins) */}
            <ClientLayout farumaClass={faruma.variable}>
              {children}
            </ClientLayout>
          </ConfirmProvider>
        </AuthGuard>

      </body>
    </html>
  );
}