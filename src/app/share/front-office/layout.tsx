import type { Metadata } from "next";

// "Add to Home Screen" from the FO Link opens this page directly (no login):
// its own manifest starts at /share/front-office instead of the app's "/" (which asks to log in).
export const metadata: Metadata = {
  title: "Front Office · HK Pulse",
  manifest: "/fo-manifest.json",
  appleWebApp: { capable: true, title: "FO Link", statusBarStyle: "default" },
};

export default function FrontOfficeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
