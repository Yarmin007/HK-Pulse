"use client";
import { supabase } from '@/lib/supabase';

// Web push for this phone, linked to the logged-in host so we can notify specific people.
// iPhone: only works when HK Pulse is added to the Home Screen (iOS 16.4+).

const urlB64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const pushPermission = (): NotificationPermission | 'unsupported' => (pushSupported() ? Notification.permission : 'unsupported');

const register = async () => {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing || navigator.serviceWorker.register('/sw.js');
};

// Saves (or re-links) this phone's subscription to the host. `ask` = may show the permission prompt.
export async function enablePush(hostId: string, ask: boolean): Promise<'on' | 'denied' | 'unsupported' | 'off' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return 'error';
  try {
    let perm = Notification.permission;
    if (perm === 'default' && ask) perm = await Notification.requestPermission();
    if (perm === 'denied') return 'denied';
    if (perm !== 'granted') return 'off';
    const reg = await register();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }));
    const json = sub.toJSON() as { endpoint: string; keys?: { auth?: string; p256dh?: string } };
    // One row per phone: replace any older row for this endpoint.
    await supabase.from('hsk_push_subscriptions').delete().eq('endpoint', json.endpoint);
    const { error } = await supabase.from('hsk_push_subscriptions').insert({ endpoint: json.endpoint, auth: json.keys?.auth, p256dh: json.keys?.p256dh, host_id: hostId });
    return error ? 'error' : 'on';
  } catch {
    return 'error';
  }
}

// Fire-and-forget push to specific hosts (by hsk_hosts.id). Returns how many phones got it.
export async function notifyHosts(hostIds: string[], title: string, body: string, url = '/requests', tag?: string): Promise<number> {
  const ids = [...new Set(hostIds.filter(Boolean))];
  if (!ids.length) return 0;
  try {
    const res = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, url, tag, hostIds: ids }) });
    const j = await res.json().catch(() => ({}));
    return Number(j.count) || 0;
  } catch {
    return 0;
  }
}
