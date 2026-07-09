import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/projects/$id/preview")({
  component: PreviewPage,
});

function PreviewPage() {
  const { id } = Route.useParams();
  const fetchProject = useServerFn(getProject);
  const { data } = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject({ data: { id } }),
  });

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scenes = data?.scenes ?? [];
  const current = scenes[index];

  useEffect(() => {
    if (!playing || !current) return;
    const a = audioRef.current;
    if (!a) return;
    a.src = current.ses_url ?? "";
    a.play().catch(() => {});
    const onEnd = () => {
      if (index + 1 < scenes.length) setIndex((i) => i + 1);
      else setPlaying(false);
    };
    a.addEventListener("ended", onEnd);
    return () => a.removeEventListener("ended", onEnd);
  }, [playing, index, current, scenes.length]);

  if (!data || !data.project || !current)
    return <div className="text-sm text-muted-foreground">Yükleniyor…</div>;

  const aspect =
    data.project.format === "9:16"
      ? "aspect-[9/16]"
      : data.project.format === "1:1"
        ? "aspect-square"
        : "aspect-video";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/projects/$id"
        params={{ id }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Projeye dön
      </Link>
      <h1 className="mt-3 font-serif text-3xl">{data.project.baslik}</h1>

      <div
        className={`relative mx-auto mt-6 w-full max-w-md overflow-hidden rounded-xl border border-border bg-black ${aspect}`}
      >
        {current.gorsel_url ? (
          <img
            key={current.id}
            src={current.gorsel_url}
            alt=""
            className="h-full w-full object-cover"
            style={{ transform: "scale(1.05)" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Görsel yok
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 text-center">
          <p className="mx-auto max-w-md text-lg font-medium leading-snug text-white">
            {current.anlatim}
          </p>
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
          {index + 1} / {scenes.length}
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ← Önceki
        </button>
        <button
          onClick={() => {
            if (playing) {
              audioRef.current?.pause();
              setPlaying(false);
            } else {
              setIndex(0);
              setPlaying(true);
            }
          }}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {playing ? "Duraklat" : "Baştan oynat"}
        </button>
        <button
          onClick={() => setIndex(Math.min(scenes.length - 1, index + 1))}
          disabled={index === scenes.length - 1}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Sonraki →
        </button>
      </div>
    </div>
  );
}