import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = body.text?.trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cap at 500 chars
  const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;

  let elRes: Response;
  try {
    elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: truncated,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );
  } catch (err) {
    console.error("[TTS] ElevenLabs fetch failed:", err);
    return new Response(
      JSON.stringify({ error: true, message: "Voice service temporarily unavailable", fallback: "text" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!elRes.ok) {
    const errText = await elRes.text().catch(() => "Unknown error");
    return new Response(
      JSON.stringify({ error: true, message: `Voice service error: ${elRes.status}`, fallback: "text" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream the audio back
  return new Response(elRes.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    },
  });
}
