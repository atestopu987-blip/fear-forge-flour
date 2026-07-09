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
  const instructions =
    "Sen genç, karizmatik ve viral bir Türk anlatıcısın — TikTok/Reels izleyicisini ilk 3 saniyede yakalayan, " +
    "derin ve sıcak erkek sesi. Enerjini yüksek tut ama dramı kaybetme: hook cümlesinde tempoyu artır, gizemli " +
    "kısımlarda fısılda, doruk noktalarında sesini büyüt. Kelimeleri net vurgula, önemli kelimelerden önce kısa " +
    "duraklamalar bırak, sonlarda cliffhanger tonu ver. Modern, sinematik, hipnotik — asla robotik ya da düz okuyucu değil.";
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
      instructions,
      speed: 1.02,
      response_format: "mp3",
    }),
  });
  if (!res.ok) surfaceGatewayError(res.status, await res.text().catch(() => ""));
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function generateImagePng(prompt: string): Promise<Uint8Array> {
  // Gemini image models have a much more permissive policy for horror/mystery
  // visual content than OpenAI, which rejects atmospheric horror prompts as
  // self-harm/violence. Also soften the wording to focus on mood, not gore.
  const softened =
    `Cinematic atmospheric illustration, moody and mysterious. ${prompt} ` +
    `No blood, no gore, no injuries, no weapons, no distressing content — ` +
    `focus on shadows, fog, lighting, and mood.`;

  const tryModel = async (model: string, body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, ...body }),
    });
    if (!res.ok) return { ok: false as const, status: res.status, text: await res.text().catch(() => "") };
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (first?.b64_json) return { ok: true as const, bytes: new Uint8Array(Buffer.from(first.b64_json, "base64")) };
    if (first?.url) {
      const r = await fetch(first.url);
      return { ok: true as const, bytes: new Uint8Array(await r.arrayBuffer()) };
    }
    return { ok: false as const, status: 500, text: "empty response" };
  };

  // Primary: Gemini (permissive for atmospheric horror).
  let r = await tryModel("google/gemini-3.1-flash-image", {
    messages: [{ role: "user", content: softened }],
    modalities: ["image", "text"],
  });
  if (r.ok) return r.bytes;

  // Fallback: OpenAI with the softened prompt.
  const r2 = await tryModel("openai/gpt-image-1-mini", { prompt: softened, quality: "low" });
  if (r2.ok) return r2.bytes;

  surfaceGatewayError(r2.status, r2.text);
}