// Scanned pre-arrival form (photo or image-only PDF) → the housekeeping fields only.
// The page images go to Gemini (same key as /api/magic); only celebration, diet, minibar, items, times, pillow,
// entertainment, bedding and other preferences come back. Names, contact, passport and flights are never returned
// and nothing is stored here: the result fills the form on screen, and the user checks it before saving.
import { NextResponse } from 'next/server';
import { PA_COMFORT, PA_DIET, PA_ENTERTAINMENT, PA_MINIBAR, PA_SCENTS, normTime } from '@/lib/preArrival';

export const maxDuration = 60;

const PROMPT = `This is a hotel guest's pre-arrival form (scanned or photographed). Read ONLY the housekeeping preferences.
Ticked boxes count only when clearly marked (tick, cross, filled box, circled). Do NOT return names, emails, phone numbers,
passport, nationality, addresses, flights or arrival details.
Return strictly one raw JSON object (no markdown) with these keys:
{
 "celebration": "what they celebrate and for whom, or empty",
 "celebration_date": "date as written, or empty",
 "diet": [any of ${JSON.stringify(PA_DIET)}],
 "allergies": "allergies as written, or empty",
 "minibar": [any of ${JSON.stringify(PA_MINIBAR)}],
 "comfort": [any of ${JSON.stringify(PA_COMFORT)}],
 "ice_time": "daily ice time HH:MM 24h, or empty",
 "service_morning": "preferred morning service time HH:MM 24h, or empty",
 "service_td": "preferred turndown / evening service time HH:MM 24h, or empty",
 "pillow": [{"scent": one of ${JSON.stringify(PA_SCENTS)}, "freq": "Once" | "Daily" | ""}],
 "entertainment": [any of ${JSON.stringify(PA_ENTERTAINMENT)}],
 "bedding": "additional bedding as written, or empty",
 "other": "any other in-villa / housekeeping preference written by the guest, or empty",
 "six_senses_before": "which other Six Senses they stayed at, or empty"
}`;

const str = (v: any) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
const pick = (v: any, allowed: string[]) => Array.isArray(v) ? [...new Set(v.map(String).map(x => allowed.find(a => a.toLowerCase() === x.trim().toLowerCase())).filter(Boolean) as string[])] : [];

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'No AI key set on the server' }, { status: 500 });
    const { images } = await req.json() as { images: string[] };
    const parts = (Array.isArray(images) ? images : []).slice(0, 4).flatMap(url => {
      const m = String(url).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      return m ? [{ inline_data: { mime_type: m[1], data: m[2] } }] : [];
    });
    if (!parts.length) return NextResponse.json({ error: 'No page images' }, { status: 400 });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, ...parts] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    const body = await res.json();
    if (!res.ok) return NextResponse.json({ error: body?.error?.message || 'AI request failed' }, { status: 502 });
    const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '{}';
    const raw = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Only the known housekeeping fields, only the known options
    const data = {
      celebration: str(raw.celebration), celebration_date: str(raw.celebration_date),
      diet: pick(raw.diet, PA_DIET), allergies: str(raw.allergies),
      minibar: pick(raw.minibar, PA_MINIBAR), comfort: pick(raw.comfort, PA_COMFORT),
      ice_time: normTime(str(raw.ice_time)), service_morning: normTime(str(raw.service_morning)), service_td: normTime(str(raw.service_td)),
      pillow: (Array.isArray(raw.pillow) ? raw.pillow : []).flatMap((p: any) => {
        const scent = PA_SCENTS.find(s => s.toLowerCase() === String(p?.scent || '').trim().toLowerCase());
        const freq = /daily/i.test(p?.freq) ? 'Daily' : /once/i.test(p?.freq) ? 'Once' : '';
        return scent ? [{ scent, freq }] : [];
      }),
      entertainment: pick(raw.entertainment, PA_ENTERTAINMENT),
      bedding: str(raw.bedding), other: str(raw.other), six_senses_before: str(raw.six_senses_before),
    };
    if (data.ice_time && !data.comfort.includes('Ice')) data.comfort.push('Ice');
    return NextResponse.json({ data });
  } catch (e: any) {
    console.error('pre-arrival-scan', e);
    return NextResponse.json({ error: 'Could not read the scan' }, { status: 500 });
  }
}
