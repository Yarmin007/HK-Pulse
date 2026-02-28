import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
    try {
        const { text, date } = await req.json();

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'No API Key' }, { status: 500 });
        }

        // FETCH NICKNAMES FROM DB
        const { data: hosts, error } = await supabase
            .from('hsk_hosts')
            .select('host_id, full_name, role, nicknames')
            .neq('status', 'Resigned');

        if (error || !hosts) {
            return NextResponse.json({ error: 'Failed to load staff list' }, { status: 500 });
        }

        // INJECT NICKNAMES INTO THE AI'S BRAIN
        const staffListStr = hosts.map(h => 
            `${h.host_id}: ${h.full_name} (${h.role}) ${h.nicknames ? `[Nicknames/Known As: ${h.nicknames}]` : ''}`
        ).join('\n');

        const prompt = `
        You are an intelligent HR Assistant for a luxury hotel in the Maldives.
        Your job is to read messy WhatsApp duty rosters and map the names to the official staff list provided.

        Official Staff List (Use the Nicknames to help match!):
        ${staffListStr}

        Target Roster Date: ${date}

        WhatsApp Message to parse:
        """
        ${text}
        """

        INSTRUCTIONS:
        1. Extract the Date mentioned in the message. If no date is found, use the Target Roster Date provided above.
        2. Identify EVERY staff member mentioned in the message. Match them to their closest Official Host ID using their Full Name or their [Nicknames].
        3. Determine their shift status based on the context:
            - If they are under "OFF", "Day Off", etc -> Status: 'O'
            - If they are under "LEAVE", "VAC" -> Status: 'AL' (or SL, PH etc if specified)
            - If they are assigned to an area/time/shift -> Status: 'P' (Present). Also extract their shift_note (e.g. "Morning", "Night", "7:30am", "Jetty A,B,C").
            - IGNORE casuals or people not on the official staff list.

        Return strictly ONLY a raw JSON object in this exact format. Do not use markdown backticks like \`\`\`json. Just the raw braces:
        {
            "date": "YYYY-MM-DD",
            "department": "Guess the department (Garden, Laundry, Public Area, Pool)",
            "records": [
                {
                    "host_id": "SSL 1234",
                    "full_name": "Mapped Full Name",
                    "status_code": "P" or "O" or "AL",
                    "shift_note": "Morning" or "Off" or "Leave" or specific assignment
                }
            ]
        }
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const outputText = data.candidates[0].content.parts[0].text;
        
        const cleanedOutput = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedOutput);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error("Magic Roster API Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to process' }, { status: 500 });
    }
}