import type { Metadata } from "next";

// Home-screen install opens this public page directly (no login), like the FO Link.
export const metadata: Metadata = {
  title: "Villa Attendants · HK Pulse",
  manifest: "/allocation-manifest.json",
  appleWebApp: { capable: true, title: "VA Allocation", statusBarStyle: "default" },
};

export default function ShareAllocationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
