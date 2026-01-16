import type { Metadata } from "next";
import "./globals.css"; // This connects your Book Antiqua and Colors
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "HK Pulse | Coordinator Hub",
  description: "Advanced Housekeeping Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* We removed 'inter.className' so it uses the font defined in globals.css.
        Added 'text-[#6D2158]' to ensure your brand color is the default.
      */}
      <body className="bg-[#FDFBFD] text-[#6D2158] font-antiqua antialiased">
        <div className="flex min-h-screen">
          {/* The Sidebar stays fixed on the left */}
          <Sidebar />
          
          {/* The Main Content pushes 64 units (16rem) to the right */}
          <main className="flex-1 ml-64 p-8 transition-all duration-300">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}