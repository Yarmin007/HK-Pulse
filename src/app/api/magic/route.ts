import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    
    // Check if API key exists
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'No API Key' }, { status: 500 });
    }

    const prompt = `
    You are a luxury hotel housekeeping coordinator assistant. Analyze the following messy message from staff/guests.
    
    1. Extract the Villa Number (digits only). If no villa is mentioned, return "".
    2. Categorize the request into exactly ONE of these options: "Cleaning", "Amenities", "Maintenance", "Minibar", "Laundry", or "General".
    3. Summarize the actionable items into a concise, professional bulleted list starting with "• ". Strip out conversational fluff (e.g., "Dear team", "kindly proceed", "thank you").

    Message: "${text}"

    Return strictly ONLY a raw JSON object in this exact format. Do not use markdown backticks like \`\`\`json. Just the raw braces:
    {
      "villa": "number",
      "category": "category",
      "summary": "• action 1\\n• action 2"
    }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    const outputText = data.candidates[0].content.parts[0].text;
    
    // Clean the output in case Gemini adds markdown formatting
    const cleanedOutput = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanedOutput);

    return NextResponse.json(parsed);

  } catch (error) {
    console.error("Magic API Error:", error);
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}