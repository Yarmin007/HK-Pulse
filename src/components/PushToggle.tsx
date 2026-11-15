"use client";
import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { enablePush, pushPermission } from '@/lib/push';

// "Turn on notifications" strip. Silently re-links this phone to the user when already allowed.
export default function PushToggle({ hostId, what }: { hostId?: string; what: string }) {
  const [state, setState] = useState<'checking' | 'on' | 'off' | 'denied' | 'unsupported'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hostId) { setState('off'); return; }
    const p = pushPermission();
    if (p === 'unsupported') { setState('unsupported'); return; }
    if (p === 'denied') { setState('denied'); return; }
    if (p !== 'granted') { setState('off'); return; }
    enablePush(hostId, false).then(r => setState(r === 'on' ? 'on' : 'off'));
  }, [hostId]);

  if (state === 'checking' || state === 'on' || !hostId) return null;

  const turnOn = async () => {
    setBusy(true);
    const r = await enablePush(hostId, true);
    setBusy(false);
    if (r === 'on') { setState('on'); toast.success('Notifications on'); }
    else if (r === 'denied') { setState('denied'); }
    else toast.error('Could not turn on notifications');
  };

  return (
    <div className="p-3 rounded-2xl bg-white border border-amber-200 flex items-center gap-3 shadow-xs">
      <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><BellOff size={17} /></div>
      <p className="flex-1 min-w-0 text-xs font-semibold text-slate-600">
        {state === 'unsupported' ? <>To get {what} on iPhone: Share → <b>Add to Home Screen</b>, open HK Pulse from there, then turn notifications on.</>
          : state === 'denied' ? <>Notifications are blocked. Allow them for HK Pulse in the phone&apos;s settings to get {what}.</>
          : <>Get a notification for {what}.</>}
      </p>
      {state === 'off' && (
        <button onClick={turnOn} disabled={busy} className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-black flex items-center gap-1.5 shrink-0 disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Turn on
        </button>
      )}
    </div>
  );
}
