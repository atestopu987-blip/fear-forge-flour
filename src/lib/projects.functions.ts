import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const NewProjectSchema = z.object({
  baslik: z.string().trim().min(1).max(100),
  konu: z.string().trim().min(1).max(500),
  ton: z.enum(["gerilim", "psikolojik", "sehir_efsanesi", "gore", "cocuk_korkusu"]),
  hedef_sure: z.number().int().min(30).max(300),
  gorsel_stili: z.enum(["karanlik_karikatur", "2d_animasyon", "gercekci_illustrasyon", "cizgi_film"]),
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
    if (!project) throw new Error("Proje bulunamadı");
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
  gore: "gore/kanlı",
  cocuk_korkusu: "çocukluk korkusu",
};

const STIL_LABEL: Record<string, string> = {
  karanlik_karikatur: "dark cartoon horror illustration, muted desaturated palette, thick outlines",
  "2d_animasyon": "2D animation cel-shaded horror, cinematic lighting",
  gercekci_illustrasyon: "realistic dark illustration, moody cinematic lighting",
  cizgi_film: "creepy stylized cartoon, exaggerated shadows",
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
    const { chatJson } = await import("./lovable-ai.server");
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.project_id)
      .maybeSingle();
    if (error || !project) throw new Error("Proje bulunamadı");

    const wordCount = Math.round((project.hedef_sure / 60) * 150);
    const tonLabel = TON_LABEL[project.ton] ?? project.ton;
    const stilLabel = STIL_LABEL[project.gorsel_stili] ?? project.gorsel_stili;

    const system = `Sen profesyonel bir korku hikayesi senaristisin. Kısa, etkili, atmosferik ve Türkçe hikayeler yazarsın. Cevabın SADECE geçerli JSON olacak; başka açıklama yazmayacaksın.`;
    const user = `Konu: "${project.konu}"
Başlık: "${project.baslik}"
Ton: ${tonLabel}
Hedef süre: ${project.hedef_sure} saniye (yaklaşık ${wordCount} kelime, 150 kelime/dakika).
Hikayeyi 6-10 sahneye böl. Her sahne için:
- "sira": 1'den başlayan tam sayı
- "anlatim": O sahnede seslendirilecek TÜRKÇE metin (2-4 cümle, dramatik)
- "gorsel_prompt": Sahneyi görselleştirecek İngilizce, detaylı image prompt; ${stilLabel} tarzında, karanlık, atmosferik.
- "ses_efekti": (opsiyonel) kısa Türkçe etiket, örn: "rüzgar", "kapı gıcırtısı"

SADECE şu JSON formatını döndür:
{"sahneler":[{"sira":1,"anlatim":"...","gorsel_prompt":"...","ses_efekti":"..."}]}`;

    const out = await chatJson<{ sahneler: SceneOut[] }>(system, user);
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

    return { count: rows.length };
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
    const { textToSpeechMp3 } = await import("./lovable-ai.server");
    const { data: scene, error } = await context.supabase
      .from("scenes")
      .select("id, project_id, sira, anlatim")
      .eq("id", data.scene_id)
      .maybeSingle();
    if (error || !scene) throw new Error("Sahne bulunamadı");
    const bytes = await textToSpeechMp3(scene.anlatim);
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
    return { url };
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
    const prompt = `${scene.gorsel_prompt}. Style: ${styleSuffix}. Dark, atmospheric, horror mood.`;
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