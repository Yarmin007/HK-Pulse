import type { Metadata, Viewport } from "next";
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

// App-like behaviour on phones: no zooming, and the on-screen keyboard resizes the page
// (so bottom buttons stay visible) instead of covering it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
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