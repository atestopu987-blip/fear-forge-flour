import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  generateImage,
  generateScript,
  generateVoice,
  getProject,
  updateScene,
} from "@/lib/projects.functions";
import { renderAndDownload, type RenderFormat } from "@/lib/render-video";
import { generateDirectorGuide, type DirectorScene } from "@/lib/projects.functions";
import {
  buildDirectorGuideMarkdown,
  downloadDirectorGuidePdf,
  downloadFullProjectZip,
  downloadJson,
  downloadText,
  downloadUrl,
  slug,
} from "@/lib/downloads";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm">
        <p className="font-serif text-lg">Bir şeyler ters gitti</p>
        <p className="mt-2 text-muted-foreground">{error.message}</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
          >
            Tekrar dene
          </button>
          <Link to="/dashboard" className="rounded-md border border-border px-3 py-1.5 text-xs">
            Panele dön
          </Link>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="rounded-lg border border-border bg-card p-6 text-sm">
      <p className="font-serif text-lg">Proje bulunamadı</p>
      <p className="mt-2 text-muted-foreground">
        Bu proje silinmiş ya da başka bir hesaba ait olabilir.
      </p>
      <Link
        to="/dashboard"
        className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
      >
        Panele dön
      </Link>
    </div>
  ),
});

type Scene = {
  id: string;
  sira: number;
  anlatim: string;
  gorsel_prompt: string;
  ses_url: string | null;
  gorsel_url: string | null;
};

function ProjectPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const fetchProject = useServerFn(getProject);
  const genScript = useServerFn(generateScript);
  const genVoice = useServerFn(generateVoice);
  const genImage = useServerFn(generateImage);
  const editScene = useServerFn(updateScene);
  const [busy, setBusy] = useState<string | null>(null);
  const [renderMsg, setRenderMsg] = useState<string | null>(null);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [director, setDirector] = useState<DirectorScene[] | null>(null);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const genDirector = useServerFn(generateDirectorGuide);
  const autoStartedRef = useRef(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject({ data: { id } }),
  });

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
      await refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    if (autoMsg) return;
    try {
      setAutoMsg("Senaryo yazılıyor…");
      const scriptRes = await genScript({ data: { project_id: project.id } });
      if (scriptRes.fallback && scriptRes.message) toast.warning(scriptRes.message);
      const fresh = await refetch();
      const list = fresh.data?.scenes ?? [];
      if (list.length === 0) throw new Error("Senaryo üretilemedi.");
      const total = list.length;
      let doneCount = 0;
      let skippedVoices = 0;
      setAutoMsg(`0/${total * 2} varlık hazır…`);
      await Promise.all(
        list.flatMap((s) => [
          (async () => {
            const voiceRes = await genVoice({ data: { scene_id: s.id } });
            if (voiceRes.skipped) skippedVoices++;
            doneCount++;
            setAutoMsg(`${doneCount}/${total * 2} varlık hazır…`);
          })(),
          (async () => {
            await genImage({ data: { scene_id: s.id } });
            doneCount++;
            setAutoMsg(`${doneCount}/${total * 2} varlık hazır…`);
          })(),
        ]),
      );
      await refetch();
      if (skippedVoices > 0) {
        toast.warning(`${skippedVoices} sahnede AI kredisi/limit nedeniyle ses atlandı; video görsellerle indirilebilir.`);
      }
      toast.success(`Tamam. ${scriptRes.count} sahne hazır.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAutoMsg(null);
    }
  }

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!data) return;
    if (typeof window === "undefined") return;
    const key = `auto:${id}`;
    if (sessionStorage.getItem(key) === "1") {
      sessionStorage.removeItem(key);
      autoStartedRef.current = true;
      void runAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, id]);

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Yükleniyor…</div>;
  }
  if (!data.project) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm">
        <p className="font-serif text-lg">Proje bulunamadı</p>
        <p className="mt-2 text-muted-foreground">
          Bu proje silinmiş ya da başka bir hesaba ait olabilir.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-block rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        >
          Panele dön
        </Link>
      </div>
    );
  }

  const { project, scenes } = data as { project: NonNullable<typeof data.project>; scenes: typeof data.scenes };
  const allImages = scenes.length > 0 && scenes.every((s) => s.gorsel_url);
  const allVoices = scenes.length > 0 && scenes.every((s) => s.ses_url);
  const projSlug = slug(project.baslik);

  return (
    <div>
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        ← Panele dön
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{project.baslik}</h1>
          <p className="text-sm text-muted-foreground">
            {project.ton} · {project.hedef_sure}s · {project.format} · {project.gorsel_stili}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.konu}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={autoMsg !== null || busy !== null}
            onClick={runAll}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-60"
          >
            {autoMsg ?? "🪄 Tek tıkla oluştur"}
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              run("script", async () => {
                const res = await genScript({ data: { project_id: project.id } });
                if (res.fallback && res.message) toast.warning(res.message);
                else toast.success("Senaryo hazır.");
              })
            }
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {busy === "script"
              ? "Yazılıyor…"
              : scenes.length > 0
                ? "Senaryoyu yeniden yaz"
                : "Senaryo üret"}
          </button>
          {scenes.length > 0 && (
            <>
              <button
                onClick={() =>
                  router.navigate({ to: "/projects/$id/preview", params: { id } })
                }
                className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                ▶ Önizle{allImages && allVoices ? "" : " (kısmi)"}
              </button>
              <button
                disabled={renderMsg !== null}
                onClick={async () => {
                  try {
                    setRenderMsg("Hazırlanıyor…");
                    await renderAndDownload({
                      scenes: scenes as unknown as Parameters<typeof renderAndDownload>[0]["scenes"],
                      format: project.format as RenderFormat,
                      title: project.baslik,
                      onProgress: (m) => setRenderMsg(m),
                    });
                    toast.success("Video indirildi.");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setRenderMsg(null);
                  }
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {renderMsg ?? "⬇ Video indir"}
              </button>
            </>
          )}
        </div>
      </div>
      {renderMsg && (
        <p className="mt-3 text-xs text-muted-foreground">
          Video tarayıcıda oluşturuluyor, sekmeyi açık tut. {renderMsg}
        </p>
      )}

      {scenes.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg">İndir & CapCut Rehberi</h2>
              <p className="text-xs text-muted-foreground">
                Her şeyi ayrı ayrı ya da tek ZIP olarak indir. Video servisi
                yoksa CapCut yönetmen rehberini kullan.
              </p>
            </div>
            {dlMsg && <span className="text-xs text-muted-foreground">{dlMsg}</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                downloadJson(
                  `${projSlug}-senaryo.json`,
                  scenes.map((s) => ({
                    sira: s.sira,
                    anlatim: s.anlatim,
                    gorsel_prompt: s.gorsel_prompt,
                  })),
                )
              }
            >
              ⬇ Senaryo (JSON)
            </button>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                downloadText(
                  `${projSlug}-senaryo.txt`,
                  scenes
                    .map((s) => `SAHNE ${s.sira}\n${s.anlatim}\n`)
                    .join("\n"),
                )
              }
            >
              ⬇ Senaryo (TXT)
            </button>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={() =>
                downloadText(
                  `${projSlug}-gorsel-promptlari.txt`,
                  scenes.map((s) => `#${s.sira}\n${s.gorsel_prompt}\n`).join("\n"),
                )
              }
            >
              ⬇ Görsel Promptları
            </button>
            <button
              disabled={busy === "director"}
              className="rounded-md border border-primary px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-60"
              onClick={() =>
                run("director", async () => {
                  const res = await genDirector({ data: { project_id: project.id } });
                  setDirector(res.scenes);
                  if (res.fallback && res.message) toast.warning(res.message);
                  else toast.success("CapCut rehberi hazır.");
                })
              }
            >
              {busy === "director"
                ? "Rehber üretiliyor…"
                : director
                  ? "🎬 Rehberi yenile"
                  : "🎬 CapCut Rehberi Üret"}
            </button>
            {director && (
              <>
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() =>
                    downloadText(
                      `${projSlug}-capcut-rehberi.md`,
                      buildDirectorGuideMarkdown(project, scenes, director),
                      "text/markdown",
                    )
                  }
                >
                  ⬇ CapCut Rehberi (MD)
                </button>
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() =>
                    downloadJson(`${projSlug}-capcut-rehberi.json`, director)
                  }
                >
                  ⬇ CapCut Rehberi (JSON)
                </button>
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() =>
                    downloadDirectorGuidePdf(
                      project,
                      scenes,
                      director,
                      `${projSlug}-capcut-rehberi.pdf`,
                    )
                  }
                >
                  ⬇ CapCut Rehberi (PDF)
                </button>
              </>
            )}
            <button
              disabled={dlMsg !== null}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              onClick={async () => {
                try {
                  setDlMsg("Paketleniyor…");
                  await downloadFullProjectZip(project, scenes, director, (m) =>
                    setDlMsg(m),
                  );
                  toast.success("Proje ZIP indirildi.");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setDlMsg(null);
                }
              }}
            >
              📦 Tüm Projeyi İndir (ZIP)
            </button>
          </div>
          {director && (
            <div className="mt-5 max-h-96 overflow-auto rounded-md border border-border bg-background/50 p-3">
              {director.map((d) => (
                <div key={d.sira} className="mb-3 text-xs">
                  <div className="font-mono text-primary/80">
                    SAHNE {d.sira} · {d.sure_sn}s · başlangıç {d.timeline_baslangic}
                  </div>
                  <div className="mt-1 grid gap-1 md:grid-cols-2">
                    <div><b>Mekan:</b> {d.mekan}</div>
                    <div><b>Kamera:</b> {d.kamera_acisi} — {d.kamera_hareketi}</div>
                    <div><b>Duygu:</b> {d.duygu}</div>
                    <div><b>Geçiş:</b> {d.gecis_efekti}</div>
                    <div><b>Zoom:</b> {d.zoom}</div>
                    <div><b>Renk:</b> {d.color_grading} · LUT: {d.lut}</div>
                    <div><b>Efektler:</b> Blur {d.blur} · Shake {d.shake} · Grain {d.film_grain}</div>
                    <div><b>Altyazı:</b> {d.altyazi_stili} — {d.yazi_animasyonu}</div>
                    <div className="md:col-span-2"><b>Müzik:</b> {d.muzik_onerisi}</div>
                    <div className="md:col-span-2"><b>Ses efektleri:</b> {(d.ses_efektleri ?? []).join(", ")}</div>
                    <div className="md:col-span-2"><b>Video promptu:</b> {d.video_prompt}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {scenes.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Henüz sahne yok. Yukarıdan "Senaryo üret" ile başla.
          </div>
        )}
        {(scenes as Scene[]).map((s) => (
          <SceneCard
            key={s.id}
            scene={s}
            busy={busy}
            onVoice={() =>
              run(`voice-${s.id}`, async () => {
                const res = await genVoice({ data: { scene_id: s.id } });
                if (res.skipped && res.message) toast.warning(res.message);
                else toast.success(`Sahne ${s.sira} sesi hazır.`);
              })
            }
            onImage={() =>
              run(`image-${s.id}`, async () => {
                await genImage({ data: { scene_id: s.id } });
                toast.success(`Sahne ${s.sira} görseli hazır.`);
              })
            }
            onSave={async (patch) => {
              await editScene({ data: { scene_id: s.id, ...patch } });
              await refetch();
              toast.success("Sahne güncellendi.");
            }}
            projSlug={projSlug}
          />
        ))}
      </div>
    </div>
  );
}

function SceneCard({
  scene,
  busy,
  onVoice,
  onImage,
  onSave,
  projSlug,
}: {
  scene: Scene;
  busy: string | null;
  onVoice: () => void;
  onImage: () => void;
  onSave: (patch: { anlatim?: string; gorsel_prompt?: string }) => Promise<void>;
  projSlug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [anlatim, setAnlatim] = useState(scene.anlatim);
  const [prompt, setPrompt] = useState(scene.gorsel_prompt);
  const voiceBusy = busy === `voice-${scene.id}`;
  const imageBusy = busy === `image-${scene.id}`;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-mono text-xs text-primary/70">SAHNE {scene.sira}</div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                rows={3}
                value={anlatim}
                onChange={(e) => setAnlatim(e.target.value)}
                className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
              />
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full rounded-md border border-input bg-input px-3 py-2 font-mono text-xs text-muted-foreground"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await onSave({ anlatim, gorsel_prompt: prompt });
                    setEditing(false);
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                >
                  Kaydet
                </button>
                <button
                  onClick={() => {
                    setAnlatim(scene.anlatim);
                    setPrompt(scene.gorsel_prompt);
                    setEditing(false);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 leading-relaxed">{scene.anlatim}</p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {scene.gorsel_prompt}
              </p>
              <button
                onClick={() => setEditing(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Düzenle
              </button>
            </>
          )}
        </div>

        {scene.gorsel_url && (
          <img
            src={scene.gorsel_url}
            alt={`Sahne ${scene.sira}`}
            className="h-32 w-32 rounded-md border border-border object-cover"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          onClick={onVoice}
          disabled={voiceBusy || busy !== null}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {voiceBusy ? "Ses üretiliyor…" : scene.ses_url ? "Sesi yenile" : "Ses üret"}
        </button>
        {scene.ses_url && <audio controls src={scene.ses_url} className="h-8 max-w-xs" />}
        {scene.ses_url && (
          <button
            onClick={() => downloadUrl(scene.ses_url!, `${projSlug}-sahne-${scene.sira}.mp3`)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            ⬇ MP3
          </button>
        )}
        <button
          onClick={onImage}
          disabled={imageBusy || busy !== null}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {imageBusy ? "Görsel üretiliyor…" : scene.gorsel_url ? "Görseli yenile" : "Görsel üret"}
        </button>
        {scene.gorsel_url && (
          <button
            onClick={() => downloadUrl(scene.gorsel_url!, `${projSlug}-sahne-${scene.sira}.png`)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            ⬇ PNG
          </button>
        )}
      </div>
    </div>
  );
}