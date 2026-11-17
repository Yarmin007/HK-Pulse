"use client";
// "Install app" button: puts the current page on the phone's home screen.
//  • Android / Chrome / Edge: opens the browser's own install dialog (beforeinstallprompt).
//  • iPhone / iPad: Apple has no install API, so it shows the 3 taps (Share → Add to Home Screen → Add).
//  • Already opened as an installed app: hidden.
import React, { useEffect, useState } from "react";
import { Download, Share, PlusSquare, MoreVertical, X, Check } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type W = Window & { __hkInstallPrompt?: InstallEvent | null };

const platformOf = (): "ios" | "android" | "other" => {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has touch
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
};

const isInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="w-7 h-7 rounded-full bg-[#6D2158] text-white text-xs font-black flex items-center justify-center shrink-0">{n}</span>
    <span className="text-sm font-semibold text-slate-700 leading-snug pt-1">{children}</span>
  </li>
);
const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 align-middle px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs">{children}</span>
);


export default function InstallAppButton({ className = "", label = "Install app" }: { className?: string; label?: string }) {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [installed, setInstalled] = useState(true); // hidden until we know
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setPlatform(platformOf());
    setInstalled(isInstalled());
    // The event may have fired before this button appeared: AuthGuard keeps it on window.
    const w = window as W;
    if (w.__hkInstallPrompt) setPrompt(w.__hkInstallPrompt);
    const onPrompt = (e: Event) => { e.preventDefault(); w.__hkInstallPrompt = e as InstallEvent; setPrompt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setHelp(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      (window as W).__hkInstallPrompt = null;
      setPrompt(null);
      if (outcome === "accepted") setInstalled(true);
      return;
    }
    setHelp(true); // iPhone, or a browser without the install dialog: show the steps
  };

  return (
    <>
      <button onClick={onClick} className={className || "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[#6D2158] text-xs font-black active:scale-95"}>
        <Download size={15} /> {label}
      </button>

      {help && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setHelp(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-black">Add to your home screen</h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">Opens like an app, straight to this page — no login.</p>
              </div>
              <button onClick={() => setHelp(false)} className="p-1.5 rounded-full bg-slate-100 text-slate-500" aria-label="Close"><X size={16} /></button>
            </div>

            {platform === "ios" ? (
              <ol className="space-y-3">
                <Step n={1}>Tap <Chip><Share size={13} /> Share</Chip> — at the bottom of Safari (top right on iPad).</Step>
                <Step n={2}>Scroll down and tap <Chip><PlusSquare size={13} /> Add to Home Screen</Chip></Step>
                <Step n={3}>Tap <Chip>Add</Chip> (top right). The icon appears on your home screen.</Step>
              </ol>
            ) : platform === "android" ? (
              <ol className="space-y-3">
                <Step n={1}>Tap the <Chip><MoreVertical size={13} /> menu</Chip> at the top right of Chrome.</Step>
                <Step n={2}>Tap <Chip>Add to Home screen</Chip> or <Chip>Install app</Chip></Step>
                <Step n={3}>Tap <Chip>Install</Chip> / <Chip>Add</Chip>.</Step>
              </ol>
            ) : (
              <ol className="space-y-3">
                <Step n={1}>Open this page on your phone (scan or send the link).</Step>
                <Step n={2}>On a computer: click the <Chip><Download size={13} /> install</Chip> icon at the right of the address bar (Chrome / Edge).</Step>
              </ol>
            )}

            {platform === "ios" && (
              <p className="mt-4 text-[11px] font-semibold text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                Don&rsquo;t see Add to Home Screen? Open the link in <b>Safari</b> first.
              </p>
            )}
            <button onClick={() => setHelp(false)} className="mt-4 w-full py-3 rounded-xl bg-[#6D2158] text-white text-sm font-black flex items-center justify-center gap-1.5"><Check size={16} /> Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
