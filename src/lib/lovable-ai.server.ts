// Server-only Lovable AI Gateway helpers. Do not import from client code.
const BASE = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not configured");
  return k;
}

function surfaceGatewayError(status: number, body: string): never {
  if (status === 429) throw new Error("AI kullanım limitine ulaşıldı, birazdan tekrar deneyin.");
  if (status === 402) throw new Error("AI kredisi bitti. Lütfen çalışma alanınıza kredi ekleyin.");
  throw new Error(`AI gateway ${status}: ${body.slice(0, 400)}`);
}

export async function chatJson<T>(system: string, user: string, model = "google/gemini-3-flash-preview"): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) surfaceGatewayError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Strip code fences if the model returned them.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(cleaned) as T;
  }
}

export async function textToSpeechMp3(input: string, voice = "onyx"): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input,
      voice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) surfaceGatewayError(res.status, await res.text().catch(() => ""));
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function generateImagePng(prompt: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt,
      quality: "low",
    }),
  });
  if (!res.ok) surfaceGatewayError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as { data: Array<{ b64_json?: string; url?: string }> };
  const first = data.data?.[0];
  if (first?.b64_json) {
    const bin = Buffer.from(first.b64_json, "base64");
    return new Uint8Array(bin);
  }
  if (first?.url) {
    const r = await fetch(first.url);
    return new Uint8Array(await r.arrayBuffer());
  }
  throw new Error("Görsel üretiminden geçerli bir sonuç dönmedi.");
}