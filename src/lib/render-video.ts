// Client-only. Cinematic scene sequence renderer:
// - Ken-burns pan+zoom (alternating direction per scene)
// - Crossfade between scenes
// - Vignette + film-grain
// - Word-by-word karaoke subtitles synced to scene duration
// Uses canvas.captureStream + WebAudio MediaStreamDestination + MediaRecorder.

export type RenderScene = {
  sira: number;
  anlatim: string;
  gorsel_url: string | null;
  ses_url: string | null;
};

export type RenderFormat = "9:16" | "1:1" | "16:9";

const CROSSFADE_MS = 500;

function dims(format: RenderFormat): { w: number; h: number } {
  if (format === "9:16") return { w: 720, h: 1280 };
  if (format === "1:1") return { w: 1080, h: 1080 };
  return { w: 1280, h: 720 };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
    img.src = url;
  });
}

async function fetchAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}

type KenBurns = {
  z0: number;
  z1: number;
  ox0: number;
  oy0: number;
  ox1: number;
  oy1: number;
};

function kenBurnsFor(i: number): KenBurns {
  // Bigger, more dynamic movement — feels like a live camera, not a slideshow
  const patterns: KenBurns[] = [
    { z0: 1.05, z1: 1.28, ox0: 0, oy0: 0.02, ox1: 0, oy1: -0.02 },
    { z0: 1.22, z1: 1.06, ox0: -0.08, oy0: 0, ox1: 0.08, oy1: 0 },
    { z0: 1.3, z1: 1.08, ox0: 0.05, oy0: -0.04, ox1: -0.05, oy1: 0.04 },
    { z0: 1.08, z1: 1.24, ox0: 0.06, oy0: 0.03, ox1: -0.06, oy1: -0.03 },
    { z0: 1.15, z1: 1.32, ox0: -0.04, oy0: -0.03, ox1: 0.04, oy1: 0.03 },
  ];
  return patterns[i % patterns.length];
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  t: number, // 0..1 progress within scene
  kb: KenBurns,
  alpha: number,
  frame = 0,
) {
  // easeInOut for smoother, more organic feel
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const zoom = kb.z0 + (kb.z1 - kb.z0) * e;
  // Subtle handheld shake
  const shakeX = Math.sin(frame * 0.21) * W * 0.0015;
  const shakeY = Math.cos(frame * 0.17) * H * 0.0015;
  const ox = (kb.ox0 + (kb.ox1 - kb.ox0) * e) * W + shakeX;
  const oy = (kb.oy0 + (kb.oy1 - kb.oy0) * e) * H + shakeY;
  const scale = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (W - dw) / 2 + ox;
  const dy = (H - dh) / 2 + oy;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

function drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.55, W / 2, H / 2, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx: CanvasRenderingContext2D, W: number, H: number, frame: number) {
  // Sparse random dots — cheap film grain
  const count = Math.floor((W * H) / 4000);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  const seed = frame * 9973;
  for (let i = 0; i < count; i++) {
    const x = ((seed + i * 131) % W) | 0;
    const y = ((seed * 7 + i * 251) % H) | 0;
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawColorGrade(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // Teal-orange cinematic tint
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(20,40,60,0.18)");
  g.addColorStop(1, "rgba(90,40,20,0.14)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawLightLeak(ctx: CanvasRenderingContext2D, W: number, H: number, frame: number) {
  const t = (frame % 300) / 300;
  const x = W * (0.15 + Math.sin(t * Math.PI * 2) * 0.1);
  const y = H * (0.2 + Math.cos(t * Math.PI * 2) * 0.05);
  const r = Math.max(W, H) * 0.35;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,120,80,0.08)");
  g.addColorStop(1, "rgba(255,120,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const test = [...cur, w].join(" ");
    if (ctx.measureText(test).width > maxWidth && cur.length) {
      lines.push(cur);
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function drawKaraokeCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  W: number,
  H: number,
  t: number, // 0..1 within scene audio
) {
  const fontSize = Math.round(W * 0.05);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const words = text.trim().split(/\s+/);
  const maxWidth = W * 0.86;
  const lines = wrapLines(ctx, words, maxWidth);
  const lineH = fontSize * 1.3;
  const blockH = lines.length * lineH;
  const pad = fontSize * 1.0;
  const bottom = H - Math.round(H * 0.07);
  const top = bottom - blockH - pad * 0.5;

  // Bottom gradient plate
  const grad = ctx.createLinearGradient(0, top - pad, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, top - pad, W, H - (top - pad));

  // Karaoke: reveal words based on t
  const totalWords = words.length;
  // Reveal timing per word for pop-in animation
  const revealFloat = Math.max(0, ((t - 0.05) / 0.85) * totalWords);
  const activeIdx = Math.min(totalWords - 1, Math.floor(revealFloat));
  const activeFrac = Math.max(0, Math.min(1, revealFloat - Math.floor(revealFloat)));

  let wordIdx = 0;
  lines.forEach((lineWords, li) => {
    const y = top + (li + 1) * lineH - lineH * 0.3;
    // Measure per-word offsets for coloring
    const spaceW = ctx.measureText(" ").width;
    const widths = lineWords.map((w) => ctx.measureText(w).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (lineWords.length - 1);
    let x = (W - totalW) / 2;
    for (let i = 0; i < lineWords.length; i++) {
      const w = lineWords[i];
      const globalIdx = wordIdx++;
      const isActive = globalIdx === activeIdx;
      const isPast = globalIdx < activeIdx;
      const isFuture = globalIdx > activeIdx;
      if (isFuture) {
        x += widths[i] + spaceW;
        continue;
      }
      // Pop-in scale + fade for the active word
      const pop = isActive ? 0.6 + 0.4 * Math.min(1, activeFrac * 3) : 1;
      const alpha = isActive ? Math.min(1, activeFrac * 4) : 1;
      ctx.save();
      const cx = x + widths[i] / 2;
      const cy = y - fontSize * 0.35;
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = isActive ? "#ffd23b" : isPast ? "#ffffff" : "rgba(255,255,255,0.35)";
      ctx.shadowColor = isActive ? "rgba(255,180,40,0.9)" : "rgba(0,0,0,0.95)";
      ctx.shadowBlur = isActive ? 22 : 12;
      ctx.textAlign = "left";
      ctx.fillText(w, x, y);
      ctx.restore();
      ctx.globalAlpha = 1;
      x += widths[i] + spaceW;
    }
  });
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: number,
) {
  const h = Math.max(3, Math.round(H * 0.005));
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, H - h, W, h);
  ctx.fillStyle = "#ff3b3b";
  ctx.fillRect(0, H - h, W * p, h);
}

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.includes("mp4") ? "mp4" : "webm" };
    }
  }
  return { mime: "video/webm", ext: "webm" };
}

export async function renderAndDownload(opts: {
  scenes: RenderScene[];
  format: RenderFormat;
  title: string;
  onProgress?: (msg: string) => void;
}): Promise<void> {
  const scenes = opts.scenes.filter((s) => s.gorsel_url && s.ses_url);
  if (scenes.length === 0) throw new Error("Her sahnenin sesi ve görseli hazır olmalı.");
  const { w: W, h: H } = dims(opts.format);

  opts.onProgress?.("Varlıklar hazırlanıyor…");

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();

  const prepared = await Promise.all(
    scenes.map(async (s, i) => ({
      scene: s,
      img: await loadImage(s.gorsel_url!),
      audio: await fetchAudioBuffer(audioCtx, s.ses_url!),
      kb: kenBurnsFor(i),
    })),
  );

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D bağlamı alınamadı.");

  const fps = 30;
  const videoStream = canvas.captureStream(fps);
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const { mime, ext } = pickMime();
  const recorder = new MediaRecorder(combined, {
    mimeType: mime,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(250);

  // Schedule audio on shared timeline
  const startAt = audioCtx.currentTime + 0.2;
  let cursor = startAt;
  const sceneStarts: number[] = []; // in seconds since startAt
  const sceneDurations: number[] = [];
  for (const p of prepared) {
    const src = audioCtx.createBufferSource();
    src.buffer = p.audio;
    src.connect(dest);
    src.start(cursor);
    sceneStarts.push(cursor - startAt);
    sceneDurations.push(p.audio.duration);
    cursor += p.audio.duration;
  }
  const totalDur = cursor - startAt;

  let frameNo = 0;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = audioCtx.currentTime;
      const elapsed = Math.max(0, now - startAt);
      const overall = Math.min(1, elapsed / totalDur);

      // Find active scene
      let idx = 0;
      for (let i = 0; i < prepared.length; i++) {
        if (elapsed >= sceneStarts[i]) idx = i;
        else break;
      }
      const local = elapsed - sceneStarts[idx];
      const dur = sceneDurations[idx];
      const t = Math.min(1, local / dur);

      // Background
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // Crossfade with next scene during last CROSSFADE_MS
      const crossfadeS = CROSSFADE_MS / 1000;
      const remaining = dur - local;
      const hasNext = idx + 1 < prepared.length;
      if (hasNext && remaining < crossfadeS) {
        const mix = 1 - remaining / crossfadeS; // 0..1 into next
        drawScene(ctx, prepared[idx].img, W, H, t, prepared[idx].kb, 1 - mix);
        drawScene(ctx, prepared[idx + 1].img, W, H, 0, prepared[idx + 1].kb, mix);
      } else {
        drawScene(ctx, prepared[idx].img, W, H, t, prepared[idx].kb, 1);
      }

      // Fade-in first 400ms of whole video
      if (elapsed < 0.4) {
        ctx.fillStyle = `rgba(0,0,0,${1 - elapsed / 0.4})`;
        ctx.fillRect(0, 0, W, H);
      }

      drawVignette(ctx, W, H);
      drawGrain(ctx, W, H, frameNo);
      drawKaraokeCaption(ctx, prepared[idx].scene.anlatim, W, H, t);
      drawProgressBar(ctx, W, H, overall);

      frameNo++;
      opts.onProgress?.(`Sahne ${idx + 1}/${prepared.length} · %${Math.round(overall * 100)}`);

      if (elapsed >= totalDur) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Final fade-out tail
  const tailStart = performance.now();
  await new Promise<void>((resolve) => {
    const tail = () => {
      const e = (performance.now() - tailStart) / 600;
      if (e >= 1) return resolve();
      ctx.fillStyle = `rgba(0,0,0,${e})`;
      ctx.fillRect(0, 0, W, H);
      requestAnimationFrame(tail);
    };
    requestAnimationFrame(tail);
  });

  recorder.stop();
  await done;
  await audioCtx.close().catch(() => {});

  const blob = new Blob(chunks, { type: mime });
  const safe =
    opts.title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "video";
  const filename = `${safe}.${ext}`;
  await saveVideoBlob(blob, filename, mime);
}

async function saveVideoBlob(blob: Blob, filename: string, mime: string) {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const isMobile = isIOS || /Android/i.test(ua);

  // 1) Try Web Share API with file (best UX on iOS/Android — user can save to Files/Photos)
  try {
    const file = new File([blob], filename, { type: mime });
    const navAny = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string }) => Promise<void>;
    };
    if (isMobile && navAny.canShare && navAny.share && navAny.canShare({ files: [file] })) {
      await navAny.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // fall through
  }

  // 2) Standard blob download
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // 3) iOS Safari fallback: navigate to blob so the user can long-press → Save
    if (isIOS) {
      setTimeout(() => {
        window.location.href = url;
      }, 200);
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }
}