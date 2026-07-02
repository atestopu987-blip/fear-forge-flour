import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="font-serif text-lg tracking-wide">Karanlık Anlatı</span>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link
            to="/auth"
            className="rounded-md px-4 py-2 text-muted-foreground hover:text-foreground"
          >
            Giriş
          </Link>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Başla
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-primary/80">
          AI korku hikayesi üretim hattı
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-tight md:text-7xl">
          Bir konu yaz.
          <br />
          <span className="text-primary">Karanlık geri yazsın.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          "Orman" yaz — AI senaryoyu yazar, sesle anlatır, sahne sahne
          görselleştirir. Yüzünü göstermeden düzenli korku videosu üret.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ücretsiz dene
          </Link>
          <a
            href="#nasil"
            className="rounded-md border border-border px-6 py-3 text-foreground hover:bg-muted"
          >
            Nasıl çalışır?
          </a>
        </div>

        <div id="nasil" className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Senaryo", d: "AI konudan sahne sahne Türkçe korku senaryosu yazar." },
            { n: "02", t: "Seslendirme", d: "Karanlık, gerilimli anlatıcı sesiyle her sahne seslendirilir." },
            { n: "03", t: "Görsel", d: "Seçtiğin stilde her sahnenin görseli otomatik üretilir." },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-card p-6 text-left">
              <div className="font-mono text-xs text-primary/70">{s.n}</div>
              <div className="mt-2 font-serif text-xl">{s.t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
