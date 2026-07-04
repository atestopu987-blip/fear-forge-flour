// Client-side download helpers. Builds JSON/TXT/ZIP artifacts from project data.
import JSZip from "jszip";
import type { DirectorScene } from "./projects.functions";

export type ProjectRow = {
  id: string;
  baslik: string;
  konu: string;
  ton: string;
  hedef_sure: number;
  gorsel_stili: string;
  format: string;
  dil: string;
};

export type SceneRow = {
  id: string;
  sira: number;
  anlatim: string;
  gorsel_prompt: string;
  ses_efekti: string | null;
  ses_url: string | null;
  gorsel_url: string | null;
};

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "proje";
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadJson(name: string, obj: unknown) {
  saveBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), name);
}

export function downloadText(name: string, text: string, mime = "text/plain") {
  saveBlob(new Blob([text], { type: `${mime};charset=utf-8` }), name);
}

export async function downloadUrl(url: string, name: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  saveBlob(blob, name);
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function buildDirectorGuideMarkdown(
  project: ProjectRow,
  scenes: SceneRow[],
  director: DirectorScene[] | null,
): string {
  const lines: string[] = [];
  lines.push(`# ${project.baslik} — CapCut Yönetmen Rehberi`);
  lines.push("");
  lines.push(`- Konu: ${project.konu}`);
  lines.push(`- Ton: ${project.ton}`);
  lines.push(`- Görsel Stili: ${project.gorsel_stili}`);
  lines.push(`- Format: ${project.format}`);
  lines.push(`- Hedef Süre: ${project.hedef_sure}s`);
  lines.push("");
  lines.push("## Zaman Çizelgesi (CapCut)");
  lines.push("");
  let cursor = 0;
  const per = project.hedef_sure / Math.max(1, scenes.length);
  for (const s of scenes) {
    const d = director?.find((x) => x.sira === s.sira);
    const dur = d?.sure_sn ?? per;
    const start = fmtTime(cursor);
    const end = fmtTime(cursor + dur);
    lines.push(`### Sahne ${s.sira} · ${start} → ${end} (${Math.round(dur)}s)`);
    lines.push("");
    lines.push(`**Anlatıcı:** ${s.anlatim}`);
    lines.push("");
    if (d) {
      lines.push(`- Mekan: ${d.mekan}`);
      lines.push(`- Atmosfer: ${d.atmosfer}`);
      lines.push(`- Kamera Açısı: ${d.kamera_acisi}`);
      lines.push(`- Kamera Hareketi: ${d.kamera_hareketi}`);
      lines.push(`- Karakter Hareketi: ${d.karakter_hareketi}`);
      lines.push(`- Duygu: ${d.duygu}`);
      lines.push(`- Ses Efektleri: ${(d.ses_efektleri ?? []).join(", ")}`);
      lines.push(`- Müzik: ${d.muzik_onerisi}`);
      lines.push(`- Diyalog: ${d.diyalog || "—"}`);
      lines.push(`- Video Promptu: ${d.video_prompt}`);
      lines.push(`- Geçiş Efekti: ${d.gecis_efekti}`);
      lines.push(`- Zoom: ${d.zoom}`);
      lines.push(`- Blur: ${d.blur} · Motion Blur: ${d.motion_blur} · Shake: ${d.shake}`);
      lines.push(`- Glow: ${d.glow}`);
      lines.push(`- Color Grading: ${d.color_grading} · LUT: ${d.lut}`);
      lines.push(`- Film Grain: ${d.film_grain} · Vignette: ${d.vignette}`);
      lines.push(`- Altyazı Stili: ${d.altyazi_stili} · Yazı Anim: ${d.yazi_animasyonu}`);
      lines.push(`- Fade: ${d.fade_sn}`);
    } else if (s.ses_efekti) {
      lines.push(`- Ses efekti: ${s.ses_efekti}`);
    }
    lines.push("");
    lines.push(`**Görsel Promptu:** ${s.gorsel_prompt}`);
    lines.push("");
    lines.push(`- Görsel dosyası: sahne-${s.sira}.png`);
    lines.push(`- Ses dosyası: sahne-${s.sira}.mp3`);
    lines.push("");
    cursor += dur;
  }
  return lines.join("\n");
}

async function fetchToUint8(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

export async function downloadFullProjectZip(
  project: ProjectRow,
  scenes: SceneRow[],
  director: DirectorScene[] | null,
  onProgress?: (msg: string) => void,
) {
  const zip = new JSZip();
  const root = slug(project.baslik);

  zip.file(`${root}/proje.json`, JSON.stringify(project, null, 2));
  zip.file(
    `${root}/senaryo.json`,
    JSON.stringify(
      scenes.map((s) => ({
        sira: s.sira,
        anlatim: s.anlatim,
        gorsel_prompt: s.gorsel_prompt,
        ses_efekti: s.ses_efekti,
      })),
      null,
      2,
    ),
  );
  zip.file(
    `${root}/senaryo.txt`,
    scenes.map((s) => `SAHNE ${s.sira}\n${s.anlatim}\n`).join("\n"),
  );
  zip.file(
    `${root}/gorsel-promptlari.txt`,
    scenes.map((s) => `#${s.sira}\n${s.gorsel_prompt}\n`).join("\n"),
  );
  if (director) {
    zip.file(`${root}/capcut-rehberi.json`, JSON.stringify(director, null, 2));
  }
  zip.file(
    `${root}/capcut-rehberi.md`,
    buildDirectorGuideMarkdown(project, scenes, director),
  );

  for (const s of scenes) {
    if (s.gorsel_url) {
      onProgress?.(`Görsel ${s.sira} indiriliyor…`);
      try {
        const bytes = await fetchToUint8(s.gorsel_url);
        zip.file(`${root}/gorseller/sahne-${s.sira}.png`, bytes);
      } catch {
        /* skip */
      }
    }
    if (s.ses_url) {
      onProgress?.(`Ses ${s.sira} indiriliyor…`);
      try {
        const bytes = await fetchToUint8(s.ses_url);
        zip.file(`${root}/sesler/sahne-${s.sira}.mp3`, bytes);
      } catch {
        /* skip */
      }
    }
  }

  onProgress?.("ZIP hazırlanıyor…");
  const blob = await zip.generateAsync({ type: "blob" });
  saveBlob(blob, `${root}.zip`);
}

export { slug };