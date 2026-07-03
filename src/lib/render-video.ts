// Client-only. Renders a scene sequence into a downloadable WebM via
// canvas.captureStream() + WebAudio MediaStreamDestination + MediaRecorder.

export type RenderScene = {
  sira: number;
  anlatim: string;
  gorsel_url: string | null;
  ses_url: string | null;
};

export type RenderFormat = "9:16" | "1:1" | "16:9";

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

async function fetchAudioBuffer(
  ctx: AudioContext,
  url: string,
): Promise<AudioBuffer> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return await ctx.decodeAudioData(buf);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  zoom: number,
) {
  const scale = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  W: number,
  H: number,
) {
  const fontSize = Math.round(W * 0.045);
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  const maxWidth = W * 0.88;
  const lines = wrapText(ctx, text, maxWidth);
  const lineH = fontSize * 1.25;
  const blockH = lines.length * lineH;
  const pad = fontSize * 0.9;
  const bottom = H - Math.round(H * 0.06);
  const top = bottom - blockH - pad;

  // Dark gradient behind text
  const grad = ctx.createLinearGradient(0, top - pad, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, top - pad, W, H - (top - pad));

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, W / 2, bottom - blockH + (i + 1) * lineH - lineH * 0.25);
  });
  ctx.shadowBlur = 0;
}

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: "webm" };
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
    scenes.map(async (s) => ({
      scene: s,
      img: await loadImage(s.gorsel_url!),
      audio: await fetchAudioBuffer(audioCtx, s.ses_url!),
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
    videoBitsPerSecond: 4_000_000,
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

  // Render loop: draw first frame, then step through scenes
  const start = performance.now();
  let sceneStart = start;
  let sceneIdx = 0;

  // Prime the very first frame
  const drawFrame = (idx: number, tSceneMs: number) => {
    const p = prepared[idx];
    const dur = p.audio.duration * 1000;
    const t = Math.min(tSceneMs / Math.max(dur, 1), 1);
    // Ken-burns zoom 1.02 -> 1.12
    const zoom = 1.02 + 0.1 * t;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawCover(ctx, p.img, W, H, zoom);
    // Fade in first 300ms
    if (tSceneMs < 300) {
      ctx.fillStyle = `rgba(0,0,0,${1 - tSceneMs / 300})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawSubtitle(ctx, p.scene.anlatim, W, H);
  };

  // Schedule all audio up-front on the shared AudioContext timeline
  let audioTime = audioCtx.currentTime + 0.15;
  const audioStarts: number[] = [];
  for (const p of prepared) {
    const src = audioCtx.createBufferSource();
    src.buffer = p.audio;
    src.connect(dest);
    src.start(audioTime);
    audioStarts.push(audioTime);
    audioTime += p.audio.duration;
  }
  const audioT0 = audioStarts[0];

  await new Promise<void>((resolve) => {
    const tick = () => {
      const nowCtx = audioCtx.currentTime;
      const elapsedMs = Math.max(0, (nowCtx - audioT0) * 1000);
      // Advance scene index based on cumulative audio durations
      let cum = 0;
      let idx = 0;
      for (let i = 0; i < prepared.length; i++) {
        const d = prepared[i].audio.duration * 1000;
        if (elapsedMs < cum + d) {
          idx = i;
          break;
        }
        cum += d;
        idx = i + 1;
      }
      if (idx >= prepared.length) {
        // Last frame of last scene
        drawFrame(prepared.length - 1, prepared[prepared.length - 1].audio.duration * 1000);
        resolve();
        return;
      }
      if (idx !== sceneIdx) {
        sceneIdx = idx;
        sceneStart = performance.now();
        opts.onProgress?.(`Sahne ${idx + 1}/${prepared.length} çiziliyor…`);
      }
      drawFrame(idx, elapsedMs - cum);
      // ignore sceneStart in favor of audio clock
      void sceneStart;
      requestAnimationFrame(tick);
    };
    opts.onProgress?.(`Sahne 1/${prepared.length} çiziliyor…`);
    requestAnimationFrame(tick);
  });

  // Small tail so recorder captures final frame
  await new Promise((r) => setTimeout(r, 400));
  recorder.stop();
  await done;
  await audioCtx.close().catch(() => {});

  const blob = new Blob(chunks, { type: mime });
  const url = URL.createObjectURL(blob);
  const safe = opts.title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "video";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}