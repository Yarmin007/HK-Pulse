"use client";

import React, { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Eye, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ClientLayoutProps {
  children: React.ReactNode;
  farumaClass?: string;
}

export default function ClientLayout({
  children,
  farumaClass = "",
}: ClientLayoutProps) {
  const [impersonatingData, setImpersonatingData] = useState<any | null>(null);

  useEffect(() => {
    const checkSession = () => {
      try {
        const raw = localStorage.getItem("hk_pulse_session");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.impersonating_from) {
            setImpersonatingData(parsed);
            return;
          }
        }
        setImpersonatingData(null);
      } catch (e) {
        setImpersonatingData(null);
      }
    };

    checkSession();
  }, []);

  const handleExitSimulation = async () => {
    try {
      const trueAdminBackup = localStorage.getItem("hk_pulse_true_admin_backup");
      if (trueAdminBackup) {
        localStorage.setItem("hk_pulse_session", trueAdminBackup);
        localStorage.removeItem("hk_pulse_true_admin_backup");
        localStorage.setItem("hk_pulse_admin_auth", "true");
        window.location.reload();
        return;
      }

      const raw = localStorage.getItem("hk_pulse_session");
      if (!raw) {
        window.location.reload();
        return;
      }
      const current = JSON.parse(raw);
      const adminOrigin = current.impersonating_from;

      if (adminOrigin?.id) {
        const { data: adminRecord } = await supabase
          .from("hsk_hosts")
          .select("*")
          .eq("id", adminOrigin.id)
          .maybeSingle();

        if (adminRecord) {
          const restored = {
            ...adminRecord,
            is_super_admin: true,
            system_role: "admin",
          };
          delete (restored as any).impersonating_from;
          localStorage.setItem("hk_pulse_session", JSON.stringify(restored));
          localStorage.setItem("hk_pulse_admin_auth", "true");
          window.location.reload();
          return;
        }
      }

      const { data: yaminRecord } = await supabase
        .from("hsk_hosts")
        .select("*")
        .ilike("full_name", "%Abdulla Yamin%")
        .maybeSingle();

      if (yaminRecord) {
        const restored = {
          ...yaminRecord,
          is_super_admin: true,
          system_role: "admin",
        };
        localStorage.setItem("hk_pulse_session", JSON.stringify(restored));
      } else {
        delete current.impersonating_from;
        current.is_super_admin = true;
        current.system_role = "admin";
        localStorage.setItem("hk_pulse_session", JSON.stringify(current));
      }

      localStorage.setItem("hk_pulse_admin_auth", "true");
      window.location.reload();
    } catch (err) {
      console.error("Failed to exit simulation:", err);
      window.location.reload();
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-[#FDFBFD] ${farumaClass}`}>
      {/* ⚡ FLOATING SLATE GLASS DOCK */}
      {impersonatingData && (
        <aside
          aria-label="Simulation Active"
          className="fixed top-3 right-4 md:right-8 z-[9999] bg-slate-950/90 text-white backdrop-blur-xl px-4 py-2 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.25)] border border-white/15 flex items-center gap-3 md:gap-4 animate-in slide-in-from-top-3 duration-300"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase font-black tracking-widest">
                <Eye size={12} className="text-emerald-400" />
                <span>Simulating Host View</span>
              </div>
              <span className="text-xs font-black text-slate-100 truncate max-w-[150px] sm:max-w-[200px]">
                {impersonatingData.full_name}
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-white/15 shrink-0"></div>

          <button
            type="button"
            onClick={handleExitSimulation}
            className="bg-white/10 hover:bg-[#6D2158] hover:border-[#6D2158] text-white px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 border border-white/20 shrink-0 cursor-pointer shadow-sm"
          >
            <ArrowLeft size={13} />
            <span>Return to Super Admin</span>
          </button>
        </aside>
      )}

      {/* MAIN VIEWPORT LAYOUT */}
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 md:pl-64 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}