import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    // 1. Safety Check: Ensure keys exist before configuring web-push
    if (!publicKey || !privateKey) {
        console.error("VAPID keys are missing from environment variables.");
        return NextResponse.json({ error: "Missing VAPID keys." }, { status: 500 });
    }

    // Configure Web Push with your keys
    webpush.setVapidDetails(
      'mailto:admin@hkpulse.com',
      publicKey,
      privateKey
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { title, body } = await req.json();

    // 2. Get all subscribed devices from the database
    const { data: subs, error } = await supabase.from('hsk_push_subscriptions').select('*');
    if (error || !subs) throw new Error('Failed to fetch subscriptions');

    // 3. Send the push notification to every device
    const notifications = subs.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { auth: sub.auth, p256dh: sub.p256dh }
      };
      
      return webpush.sendNotification(pushSubscription, JSON.stringify({ title, body }))
        .catch(async (err) => {
          // If a device uninstalled the app or blocked notifications, delete it from the DB
          if (err.statusCode === 410 || err.statusCode === 404) {
             await supabase.from('hsk_push_subscriptions').delete().eq('id', sub.id);
          }
          console.error("Push delivery error for endpoint:", sub.endpoint);
        });
    });

    await Promise.all(notifications);
    return NextResponse.json({ success: true, count: subs.length });

  } catch (err: any) {
    console.error("API Notify Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}