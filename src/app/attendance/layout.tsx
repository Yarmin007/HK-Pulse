"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { hasFullControl } from '@/lib/fullControl';

// Attendance, Monthly, Casual Attendance and Leave Clearance hold everyone's attendance and leave:
// only people with full control may open them, even with a direct link.
export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
    const [allowed, setAllowed] = useState<boolean | null>(null);

    useEffect(() => { setAllowed(hasFullControl()); }, []);

    if (allowed === null) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#6D2158]/20 border-t-[#6D2158] rounded-full animate-spin" />
            </div>
        );
    }

    if (!allowed) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6">
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 max-w-sm w-full text-center">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                        <ShieldAlert size={22} />
                    </div>
                    <h1 className="text-lg font-black text-slate-800">No access</h1>
                    <p className="text-xs font-semibold text-slate-500 mt-1.5">
                        The attendance sheet is only available to admins with full control.
                    </p>
                    <Link href="/" className="inline-block mt-5 px-4 py-2.5 bg-[#6D2158] hover:bg-[#5a1b49] text-white rounded-xl text-xs font-bold">
                        Back to dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
