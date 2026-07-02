import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const fetchProjects = useServerFn(listProjects);
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl">Projeler</h1>
          <p className="text-sm text-muted-foreground">Tüm korku hikayelerin.</p>
        </div>
        <Link
          to="/projects/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Yeni Video
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Yükleniyor…</div>
        )}
        {data && data.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-12 text-center">
            <p className="font-serif text-xl">Henüz proje yok</p>
            <p className="mt-2 text-sm text-muted-foreground">
              İlk korku hikayeni oluşturmak için başla.
            </p>
            <Link
              to="/projects/new"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Yeni Video
            </Link>
          </div>
        )}
        {data?.map((p) => (
          <Link
            key={p.id}
            to="/projects/$id"
            params={{ id: p.id }}
            onMouseEnter={() =>
              router.preloadRoute({ to: "/projects/$id", params: { id: p.id } })
            }
            className="group rounded-lg border border-border bg-card p-5 hover:border-primary/60"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(p.created_at).toLocaleDateString("tr-TR")}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5">{p.durum}</span>
            </div>
            <h3 className="mt-3 font-serif text-xl group-hover:text-primary">{p.baslik}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.konu}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}