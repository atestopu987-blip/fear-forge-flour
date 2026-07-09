// Server-only Lovable AI Gateway helpers. Do not import from client code.
import { deflateSync } from "zlib";

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

function hasBillingOrLimitError(result: { ok: false; status: number; text: string }) {
  return result.status === 402 || result.status === 429;
}

function sanitizeImagePrompt(input: string) {
  const replacements: Array<[RegExp, string]> = [
    [/\b(blood|bloody|gore|gory|wound|injury|corpse|dead body|murder|suicide|self[-\s]?harm|knife|gun|weapon|stab|kill|killing|hanged|hanging)\b/gi, "mysterious shadow"],
    [/\b(kan|kanlı|vahşet|ceset|cinayet|intihar|kendine zarar|bıçak|silah|yaralanma|öldürmek|asılı)\b/gi, "gizemli gölge"],
    [/\b(horror|terror|violent|violence|gore\/kanlı)\b/gi, "mystery suspense"],
  ];
  return replacements.reduce((text, [pattern, safe]) => text.replace(pattern, safe), input).replace(/\s+/g, " ").trim();
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, false);
  return out;
}

function chunk(type: string, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  return Buffer.concat([
    Buffer.from(u32(data.length)),
    Buffer.from(typeBytes),
    Buffer.from(data),
    Buffer.from(u32(crc32(Buffer.concat([Buffer.from(typeBytes), Buffer.from(data)])))),
  ]);
}

function createAtmosphericFallbackPng(prompt: string) {
  const width = 720;
  const height = 1280;
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i++) hash = Math.imul(hash ^ prompt.charCodeAt(i), 16777619);

  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.45) * 2;
      const vignette = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny) * 0.72);
      const mist = (Math.sin(x * 0.018 + y * 0.006 + hash * 0.00001) + Math.sin(x * 0.009 - y * 0.012)) * 0.5 + 1;
      const glow = Math.max(0, 1 - Math.hypot(nx * 0.85, ny + 0.28)) * 64;
      const noise = ((Math.imul(x + 31, y + 17) ^ hash) & 15) - 7;
      const i = row + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, 10 + 18 * (1 - t) + glow * 0.35 + mist * 5 + noise));
      raw[i + 1] = Math.max(0, Math.min(255, 16 + 36 * vignette + glow * 0.55 + mist * 7 + noise));
      raw[i + 2] = Math.max(0, Math.min(255, 24 + 56 * (1 - t * 0.35) + glow * 0.85 + mist * 10 + noise));
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND"),
  ]));
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

type TtsOptions = { mood?: string; voice?: string };

const HORROR_INSTR =
  "Sen genç, karizmatik ve viral bir Türk anlatıcısın — TikTok/Reels izleyicisini ilk 3 saniyede yakalayan, " +
  "derin ve sıcak erkek sesi. Enerjini yüksek tut ama dramı kaybetme: hook cümlesinde tempoyu artır, gizemli " +
  "kısımlarda fısılda, doruk noktalarında sesini büyüt. Kelimeleri net vurgula, önemli kelimelerden önce kısa " +
  "duraklamalar bırak, sonlarda cliffhanger tonu ver. Modern, sinematik, hipnotik — asla robotik ya da düz okuyucu değil.";

const FUN_INSTR =
  "Sen neşeli, enerjik ve komik bir genç Türk TikTok anlatıcısısın. İnce, parlak ve tempolu bir sesle konuş; " +
  "gülümseten vurgular, sürpriz tonlamalar, hızlı ritim. Her cümlenin sonuna hafif komik bir tını bırak, " +
  "önemli kelimelerde sesini yükselt, aralarda mini kahkaha imaları hisset. Akıcı, hızlı ve eğlenceli — asla düz okuyucu değil.";

const PLUS18_INSTR =
  "Sen fısıltılı, flörtöz ve cesur bir yetişkin Türk anlatıcısın. Sıcak, biraz alaycı, çift anlamlı vurgularla; " +
  "hızlı tempo, kısa duraklamalar, gülümseyen bir ton. Zarif kal, uygunsuz olma — ama imalar hissedilsin. " +
  "Modern, çekici, seyirciyi çeken bir kadın-erkek arası nötr, oyunbaz enerji.";

function moodToVoiceProfile(mood?: string) {
  switch (mood) {
    case "eglence":
      return { voice: "nova", speed: 1.15, instructions: FUN_INSTR };
    case "plus18":
      return { voice: "sage", speed: 1.1, instructions: PLUS18_INSTR };
    default:
      return { voice: "onyx", speed: 1.02, instructions: HORROR_INSTR };
  }
}

export async function textToSpeechMp3(input: string, opts: TtsOptions = {}): Promise<Uint8Array> {
  const profile = moodToVoiceProfile(opts.mood);
  const voice = opts.voice ?? profile.voice;
  const instructions = profile.instructions;
  const speed = profile.speed;
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
      speed,
      response_format: "mp3",
    }),
  });
  if (!res.ok) surfaceGatewayError(res.status, await res.text().catch(() => ""));
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function generateImagePng(prompt: string): Promise<Uint8Array> {
  // Keep generated visuals atmospheric and non-graphic. OpenAI image models are
  // intentionally avoided here because horror story prompts are often rejected
  // as violence/self-harm even after softening.
  const cleaned = sanitizeImagePrompt(prompt);
  const safePrompts = [
    `Cinematic atmospheric illustration for a Turkish mystery short film. ${cleaned}. Focus on fog, moonlight, expressive shadows, old architecture, dramatic composition, rich texture, teal-orange cinematic color grade, vertical social-video framing.`,
    `Family-safe eerie mystery illustration, empty foggy village road, old wooden house silhouette, moonlight through trees, long shadows, cinematic lighting, high detail, vertical composition.`,
  ];

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

  const failures: Array<{ ok: false; status: number; text: string }> = [];
  for (const safePrompt of safePrompts) {
    for (const model of ["google/gemini-3-pro-image", "google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"]) {
      const r = await tryModel(model, {
        messages: [{ role: "user", content: safePrompt }],
        modalities: ["image", "text"],
      });
      if (r.ok) return r.bytes;
      failures.push(r);
      if (hasBillingOrLimitError(r)) surfaceGatewayError(r.status, r.text);
    }
  }

  // Last-resort local frame: keeps one-click generation and preview/download
  // alive even if the provider rejects a scene-specific image request.
  return createAtmosphericFallbackPng(cleaned || prompt);
}