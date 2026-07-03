import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  generateImage,
  generateScript,
  generateVoice,
  getProject,
  updateScene,
} from "@/lib/projects.functions";
import { renderAndDownload, type RenderFormat } from "@/lib/render-video";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectPage,
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

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Yükleniyor…</div>;
  }

  const { project, scenes } = data;
  const allImages = scenes.length > 0 && scenes.every((s) => s.gorsel_url);
  const allVoices = scenes.length > 0 && scenes.every((s) => s.ses_url);

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
            disabled={busy !== null}
            onClick={() =>
              run("script", async () => {
                await genScript({ data: { project_id: project.id } });
                toast.success("Senaryo hazır.");
              })
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === "script"
              ? "Yazılıyor…"
              : scenes.length > 0
                ? "Senaryoyu yeniden yaz"
                : "Senaryo üret"}
          </button>
          {allImages && allVoices && (
            <>
              <button
                onClick={() =>
                  router.navigate({ to: "/projects/$id/preview", params: { id } })
                }
                className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                ▶ Önizle
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
                await genVoice({ data: { scene_id: s.id } });
                toast.success(`Sahne ${s.sira} sesi hazır.`);
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
}: {
  scene: Scene;
  busy: string | null;
  onVoice: () => void;
  onImage: () => void;
  onSave: (patch: { anlatim?: string; gorsel_prompt?: string }) => Promise<void>;
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
        <button
          onClick={onImage}
          disabled={imageBusy || busy !== null}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {imageBusy ? "Görsel üretiliyor…" : scene.gorsel_url ? "Görseli yenile" : "Görsel üret"}
        </button>
      </div>
    </div>
  );
}