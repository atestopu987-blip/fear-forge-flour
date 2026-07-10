import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const NewProjectSchema = z.object({
  baslik: z.string().trim().min(1).max(100),
  konu: z.string().trim().min(1).max(500),
  ton: z.enum([
    "gerilim",
    "psikolojik",
    "sehir_efsanesi",
    "gore",
    "cocuk_korkusu",
    "eglence",
    "plus18",
  ]),
  hedef_sure: z.number().int().min(30).max(300),
  gorsel_stili: z.enum([
    "karanlik_karikatur",
    "2d_animasyon",
    "gercekci_illustrasyon",
    "cizgi_film",
    "cop_adam",
    "kagit_fonlu",
  ]),
  format: z.enum(["9:16", "1:1", "16:9"]),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NewProjectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({ ...data, user_id: context.userId, durum: "taslak" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) return { project: null, scenes: [] as never[] };
    const { data: scenes, error: se } = await context.supabase
      .from("scenes")
      .select("*")
      .eq("project_id", data.id)
      .order("sira", { ascending: true });
    if (se) throw new Error(se.message);
    return { project, scenes: scenes ?? [] };
  });

const TON_LABEL: Record<string, string> = {
  gerilim: "atmosferik gerilim",
  psikolojik: "psikolojik korku",
  sehir_efsanesi: "şehir efsanesi",
  gore: "karanlık ve yoğun gerilim",
  cocuk_korkusu: "çocukluk korkusu",
  eglence: "eğlenceli, neşeli komedi",
  plus18: "yetişkin, flörtöz, cesur mizah (18+)",
};

const STIL_LABEL: Record<string, string> = {
  karanlik_karikatur: "dark cartoon horror illustration, muted desaturated palette, thick outlines",
  "2d_animasyon": "2D animation cel-shaded horror, cinematic lighting",
  gercekci_illustrasyon: "realistic dark illustration, moody cinematic lighting",
  cizgi_film: "creepy stylized cartoon, exaggerated shadows",
  cop_adam:
    "hand-drawn black stick figure characters on white paper background, minimalist doodle, playful marker sketch, notebook paper texture",
  kagit_fonlu:
    "flat paper craft illustration, torn paper collage, beige notebook paper background, marker doodle style, playful hand-drawn",
};

type SceneOut = {
  sira: number;
  anlatim: string;
  gorsel_prompt: string;
  ses_efekti?: string;
};

export const generateScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { chatJson, isAiBillingOrLimitError } = await import("./lovable-ai.server");
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.project_id)
      .maybeSingle();
    if (error || !project) throw new Error("Proje bulunamadı");

    const wordCount = Math.round((project.hedef_sure / 60) * 150);
    const tonLabel = TON_LABEL[project.ton] ?? project.ton;
    const stilLabel = STIL_LABEL[project.gorsel_stili] ?? project.gorsel_stili;

    const isAtasozu = project.konu.trim().startsWith("[ATASÖZÜ]");
    const atasozuText = isAtasozu ? project.konu.replace(/^\[ATASÖZÜ\]\s*/i, "").trim() : "";
    const isFun = project.ton === "eglence";
    const isPlus18 = project.ton === "plus18";

    const system = isAtasozu
      ? `Sen deneyimli bir Türk halk kültürü anlatıcısı ve senaristsin. Verilen atasözünün olası kökenini 4-5 sahnelik kısa, etkileyici bir hikaye şeklinde anlatırsın. Sonda atasözünün nasıl doğduğu net biçimde anlaşılmalı. Cevabın SADECE geçerli JSON olacak.`
      : isPlus18
        ? `Sen TikTok/Reels için yetişkin (18+) mizah anlatıcısı ve senaristsin. Flörtöz, cesur, çift anlamlı, komik ve neşeli Türkçe hikayeler yazarsın. Cinsel organ, açık cinsel eylem, uygunsuz ilişki tanımı YAZMAZSIN; imalı, kışkırtıcı ama zarif kalırsın. Hızlı tempo, kısa cümleler, güçlü bir hook. Cevabın SADECE geçerli JSON olacak.`
        : isFun
          ? `Sen TikTok/Reels için viral olmuş, neşeli ve eğlenceli bir Türk anlatıcı ve komedi senaristisin. Enerjik, hızlı tempolu, sürprizli ve gülümseten, Gen-Z tonlu, modern Türkçe hikayeler yazarsın. İlk sahne güçlü bir hook cümlesiyle açılır. Cevabın SADECE geçerli JSON olacak.`
          : `Sen TikTok/Reels/Shorts için viral olmuş bir Türk gerilim ve gizem anlatıcısı ve senaristsin. Gen-Z izleyicisini ilk 3 saniyede yakalayan, hızlı tempolu, cliffhanger'larla ilerleyen, modern ve akıcı Türkçe hikayeler yazarsın. Kan, yara, silah, intihar, kendine zarar verme veya grafik şiddet yazmazsın; korkuyu atmosfer, gölge, ses, bilinmezlik ve psikolojik gerilimle kurarsın. İlk sahne mutlaka güçlü bir hook cümlesiyle başlar ("Bunu kimseye anlatmadım ama…", "Saat 3'te uyandığımda…" gibi). Kısa cümleler, dramatik duraklamalar, günümüz Türkçesi. Cevabın SADECE geçerli JSON olacak.`;

    const user = isAtasozu
      ? `Atasözü: "${atasozuText}"
Başlık: "${project.baslik}"
Hedef süre: ${project.hedef_sure} sn (yaklaşık ${wordCount} kelime).
Bu atasözünün nasıl ortaya çıktığını anlatan TAM 4 veya 5 sahnelik bir köken hikayesi kur. Karakter, mekan, olay örgüsü, doruk ve sonda atasözünün doğduğu an olsun. Görsel stili: ${stilLabel} (atmosferi hikayeye uygun ayarla; atasözü hikayesi mutlaka korku olmayabilir).
Her sahne için:
- "sira": 1'den başlayan tam sayı
- "anlatim": TÜRKÇE anlatıcı metni (2-4 cümle, akıcı ve dramatik). Son sahnenin sonunda atasözünün kendisi geçsin.
- "gorsel_prompt": İngilizce detaylı image prompt; ${stilLabel}, sahnenin ruhuna uygun.
- "ses_efekti": (opsiyonel) kısa Türkçe etiket.

SADECE şu JSON:
{"sahneler":[{"sira":1,"anlatim":"...","gorsel_prompt":"...","ses_efekti":"..."}]}`
      : `Konu: "${project.konu}"
Başlık: "${project.baslik}"
Ton: ${tonLabel}
Hedef süre: ${project.hedef_sure} saniye (yaklaşık ${wordCount} kelime, 150 kelime/dakika).
Hikayeyi 6-10 sahneye böl. Her sahne için:
- "sira": 1'den başlayan tam sayı
- "anlatim": O sahnede seslendirilecek TÜRKÇE metin (2-4 cümle, dramatik)
- "gorsel_prompt": Sahneyi görselleştirecek İngilizce, detaylı image prompt; ${stilLabel} tarzında, atmosferik, sinematik, grafik olmayan. Kan, yara, silah, intihar, kendine zarar verme, ceset ve açık şiddet kelimelerini kullanma; sis, gölge, ışık, boş mekan, semboller ve mimari detaylarla gerilim kur.
- "ses_efekti": (opsiyonel) kısa Türkçe etiket, örn: "rüzgar", "kapı gıcırtısı"

SADECE şu JSON formatını döndür:
{"sahneler":[{"sira":1,"anlatim":"...","gorsel_prompt":"...","ses_efekti":"..."}]}`;

    let usedFallback = false;
    let out: { sahneler: SceneOut[] };
    try {
      out = await chatJson<{ sahneler: SceneOut[] }>(system, user);
    } catch (err) {
      if (!isAiBillingOrLimitError(err)) throw err;
      const { buildFallbackScript } = await import("./project-fallbacks.server");
      out = buildFallbackScript(project);
      usedFallback = true;
    }
    const sahneler = out.sahneler ?? [];
    if (sahneler.length === 0) throw new Error("Senaryo üretilemedi");

    // Wipe old scenes, insert fresh
    await context.supabase.from("scenes").delete().eq("project_id", data.project_id);
    const rows = sahneler.map((s) => ({
      project_id: data.project_id,
      sira: s.sira,
      anlatim: s.anlatim,
      gorsel_prompt: s.gorsel_prompt,
      ses_efekti: s.ses_efekti ?? null,
      durum: "senaryo_hazir",
    }));
    const { error: ie } = await context.supabase.from("scenes").insert(rows);
    if (ie) throw new Error(ie.message);

    await context.supabase
      .from("projects")
      .update({ durum: "senaryo_hazir" })
      .eq("id", data.project_id);

    return {
      count: rows.length,
      fallback: usedFallback,
      message: usedFallback
        ? "AI kredisi/limit nedeniyle yerel yedek senaryo üretildi. AI kalitesinde üretim için kredi ekleyin."
        : null,
    };
  });

export const updateScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scene_id: z.string().uuid(),
        anlatim: z.string().trim().min(1).max(1000).optional(),
        gorsel_prompt: z.string().trim().min(1).max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { anlatim?: string; gorsel_prompt?: string } = {};
    if (data.anlatim !== undefined) patch.anlatim = data.anlatim;
    if (data.gorsel_prompt !== undefined) patch.gorsel_prompt = data.gorsel_prompt;
    const { error } = await context.supabase.from("scenes").update(patch).eq("id", data.scene_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function uploadAsset(
  ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string },
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const key = `${ctx.userId}/${path}`;
  const { error } = await ctx.supabase.storage
    .from("scene-assets")
    .upload(key, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data: signed, error: se } = await ctx.supabase.storage
    .from("scene-assets")
    .createSignedUrl(key, 60 * 60 * 24 * 7);
  if (se) throw new Error(se.message);
  return signed.signedUrl;
}

export const generateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scene_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { textToSpeechMp3, isAiBillingOrLimitError } = await import("./lovable-ai.server");
    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, project_id, sira, anlatim")
      .eq("id", data.scene_id)
      .maybeSingle();
    if (error || !scene) throw new Error("Sahne bulunamadı");
    const { data: proj } = await context.supabase
      .from("projects")
      .select("ton")
      .eq("id", scene.project_id)
      .maybeSingle();
    let bytes: Uint8Array;
    try {
      bytes = await textToSpeechMp3(scene.anlatim, { mood: proj?.ton ?? "gerilim" });
    } catch (err) {
      if (!isAiBillingOrLimitError(err)) throw err;
      return {
        url: null,
        skipped: true,
        message: "AI kredisi/limit nedeniyle ses üretilemedi. Görselsiz/sessiz video indirebilir veya kredi ekleyip sesi tekrar üretebilirsiniz.",
      };
    }
    const url = await uploadAsset(
      { supabase: context.supabase, userId: context.userId },
      `${scene.project_id}/scene-${scene.sira}-${Date.now()}.mp3`,
      bytes,
      "audio/mpeg",
    );
    const { error: ue } = await context.supabase
      .from("scenes")
      .update({ ses_url: url })
      .eq("id", scene.id);
    if (ue) throw new Error(ue.message);
    return { url, skipped: false, message: null };
  });

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scene_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateImagePng } = await import("./lovable-ai.server");
    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, project_id, sira, gorsel_prompt")
      .eq("id", data.scene_id)
      .maybeSingle();
    if (error || !scene) throw new Error("Sahne bulunamadı");
    const { data: project } = await context.supabase
      .from("projects")
      .select("gorsel_stili")
      .eq("id", scene.project_id)
      .maybeSingle();
    const styleSuffix = project ? STIL_LABEL[project.gorsel_stili] ?? "" : "";
    const prompt = `${scene.gorsel_prompt}. Style: ${styleSuffix}. Atmospheric mystery mood, cinematic lighting, fog, shadows, symbolic tension, no graphic violence.`;
    const bytes = await generateImagePng(prompt);
    const url = await uploadAsset(
      { supabase: context.supabase, userId: context.userId },
      `${scene.project_id}/scene-${scene.sira}-${Date.now()}.png`,
      bytes,
      "image/png",
    );
    const { error: ue } = await context.supabase
      .from("scenes")
      .update({ gorsel_url: url })
      .eq("id", scene.id);
    if (ue) throw new Error(ue.message);
    return { url };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("scenes").delete().eq("project_id", data.id);
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !src) throw new Error("Proje bulunamadı");
    const { data: copy, error: ce } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        baslik: `${src.baslik} (kopya)`,
        konu: src.konu,
        ton: src.ton,
        hedef_sure: src.hedef_sure,
        gorsel_stili: src.gorsel_stili,
        format: src.format,
        dil: src.dil,
        durum: "taslak",
      })
      .select("id")
      .single();
    if (ce || !copy) throw new Error(ce?.message ?? "Kopyalanamadı");
    return { id: copy.id as string };
  });

export type DirectorScene = {
  sira: number;
  sure_sn: number;
  timeline_baslangic: string;
  mekan: string;
  atmosfer: string;
  kamera_acisi: string;
  kamera_hareketi: string;
  karakter_hareketi: string;
  duygu: string;
  ses_efektleri: string[];
  muzik_onerisi: string;
  anlatici_metni: string;
  diyalog: string;
  gorsel_prompt: string;
  video_prompt: string;
  gecis_efekti: string;
  zoom: string;
  blur: string;
  motion_blur: string;
  shake: string;
  glow: string;
  color_grading: string;
  lut: string;
  film_grain: string;
  vignette: string;
  altyazi_stili: string;
  yazi_animasyonu: string;
  fade_sn: string;
};

export const generateDirectorGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ project_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { chatJson, isAiBillingOrLimitError } = await import("./lovable-ai.server");
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.project_id)
      .maybeSingle();
    if (error || !project) throw new Error("Proje bulunamadı");
    const { data: scenes } = await context.supabase
      .from("scenes")
      .select("*")
      .eq("project_id", data.project_id)
      .order("sira", { ascending: true });
    if (!scenes || scenes.length === 0) throw new Error("Önce senaryo üret.");

    const perScene = Math.max(4, Math.round(project.hedef_sure / scenes.length));
    const tonLabel = TON_LABEL[project.ton] ?? project.ton;
    const stilLabel = STIL_LABEL[project.gorsel_stili] ?? project.gorsel_stili;

    const system = `Sen profesyonel bir video yönetmenisin ve CapCut editörüsün. Her sahne için detaylı, uygulanabilir montaj talimatları verirsin. Cevabın SADECE geçerli JSON olacak.`;
    const user = `Proje: "${project.baslik}" — ${project.konu}
Ton: ${tonLabel}. Görsel stili: ${stilLabel}. Format: ${project.format}. Toplam süre: ${project.hedef_sure}s.
Her sahne yaklaşık ${perScene}s. ${scenes.length} sahne var.

Sahneler:
${scenes.map((s) => `#${s.sira}: ${s.anlatim}`).join("\n")}

Her sahne için TÜRKÇE, kısa ve pratik CapCut talimatları üret. SADECE şu JSON:
{"sahneler":[{
"sira":1,"sure_sn":${perScene},"timeline_baslangic":"0:00",
"mekan":"...","atmosfer":"...","kamera_acisi":"low angle | close-up | wide vs.",
"kamera_hareketi":"dolly in | pan left vs.","karakter_hareketi":"...","duygu":"...",
"ses_efektleri":["rüzgar","gıcırtı"],"muzik_onerisi":"karanlık ambient, 60 BPM",
"anlatici_metni":"...","diyalog":"...","gorsel_prompt":"...","video_prompt":"...",
"gecis_efekti":"cross dissolve | glitch | whip pan","zoom":"1.0 → 1.15 yavaş",
"blur":"hafif gaussian 2px","motion_blur":"orta","shake":"düşük",
"glow":"gözlerde soft glow","color_grading":"teal-orange, gölgeler +","lut":"Cinematic Horror",
"film_grain":"orta","vignette":"koyu","altyazi_stili":"beyaz, kalın, gölge",
"yazi_animasyonu":"typewriter","fade_sn":"in 0.3 / out 0.3"
}]}`;

    try {
      const out = await chatJson<{ sahneler: DirectorScene[] }>(system, user);
      return { scenes: out.sahneler ?? [], fallback: false, message: null };
    } catch (err) {
      if (!isAiBillingOrLimitError(err)) throw err;
      const { buildFallbackDirectorGuide } = await import("./project-fallbacks.server");
      return {
        scenes: buildFallbackDirectorGuide(project, scenes) as DirectorScene[],
        fallback: true,
        message: "AI kredisi/limit nedeniyle yerel CapCut rehberi oluşturuldu.",
      };
    }
  });