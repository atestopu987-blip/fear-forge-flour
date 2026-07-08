import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/projects/new")({
  component: NewProject,
});

function NewProject() {
  const navigate = useNavigate();
  const create = useServerFn(createProject);
  const [busy, setBusy] = useState(false);
  const [atasozuMode, setAtasozuMode] = useState(false);
  const [form, setForm] = useState({
    baslik: "",
    konu: "",
    ton: "gerilim" as "gerilim" | "psikolojik" | "sehir_efsanesi" | "gore" | "cocuk_korkusu",
    hedef_sure: 60,
    gorsel_stili: "karanlik_karikatur" as
      | "karanlik_karikatur"
      | "2d_animasyon"
      | "gercekci_illustrasyon"
      | "cizgi_film",
    format: "9:16" as "9:16" | "1:1" | "16:9",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = atasozuMode
        ? { ...form, konu: `[ATASÖZÜ] ${form.konu}` }
        : form;
      const res = await create({ data: payload });
      toast.success("Proje oluşturuldu. Otomatik üretim başlıyor…");
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`auto:${res.id}`, "1");
      }
      navigate({ to: "/projects/$id", params: { id: res.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-input bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        ← Panele dön
      </Link>
      <h1 className="mt-3 font-serif text-3xl">Yeni Korku Videosu</h1>
      <p className="text-sm text-muted-foreground">
        Ayarları seç, sonraki adımda AI senaryoyu yazsın.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="flex items-start gap-3 rounded-md border border-input bg-input/40 p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={atasozuMode}
            onChange={(e) => setAtasozuMode(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Atasözü modu</span>
            <span className="block text-muted-foreground">
              Konu alanına bir atasözü yaz; AI, atasözünün kökenini 4-5 sahnede hikayeleştirsin ve
              uygun görseller üretsin.
            </span>
          </span>
        </label>

        <div>
          <label className="mb-1 block text-sm">Başlık</label>
          <input
            required
            maxLength={100}
            className={field}
            placeholder={atasozuMode ? "Atasözünün başlığı (ör. Damlaya damlaya göl olur)" : "Orman"}
            value={form.baslik}
            onChange={(e) => setForm({ ...form, baslik: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">{atasozuMode ? "Atasözü" : "Konu"}</label>
          <textarea
            required
            rows={3}
            maxLength={500}
            className={field}
            placeholder={
              atasozuMode
                ? "Örn: Damlaya damlaya göl olur"
                : "Kamp yapmak için ormana giren üç arkadaşın başına gelenler…"
            }
            value={form.konu}
            onChange={(e) => setForm({ ...form, konu: e.target.value })}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Ton</label>
            <select
              className={field}
              value={form.ton}
              onChange={(e) => setForm({ ...form, ton: e.target.value as typeof form.ton })}
            >
              <option value="gerilim">Gerilim</option>
              <option value="psikolojik">Psikolojik</option>
              <option value="sehir_efsanesi">Şehir Efsanesi</option>
              <option value="gore">Gore / Kanlı</option>
              <option value="cocuk_korkusu">Çocukluk Korkusu</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Süre (sn)</label>
            <select
              className={field}
              value={form.hedef_sure}
              onChange={(e) => setForm({ ...form, hedef_sure: Number(e.target.value) })}
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={120}>120</option>
              <option value={180}>180</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Görsel Stili</label>
            <select
              className={field}
              value={form.gorsel_stili}
              onChange={(e) =>
                setForm({ ...form, gorsel_stili: e.target.value as typeof form.gorsel_stili })
              }
            >
              <option value="karanlik_karikatur">Karanlık Karikatür</option>
              <option value="2d_animasyon">2D Animasyon</option>
              <option value="gercekci_illustrasyon">Gerçekçi İllüstrasyon</option>
              <option value="cizgi_film">Ürkütücü Çizgi Film</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Format</label>
            <select
              className={field}
              value={form.format}
              onChange={(e) =>
                setForm({ ...form, format: e.target.value as typeof form.format })
              }
            >
              <option value="9:16">9:16 (Reels/TikTok)</option>
              <option value="1:1">1:1 (Kare)</option>
              <option value="16:9">16:9 (YouTube)</option>
            </select>
          </div>
        </div>

        <button
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Oluşturuluyor…" : "Projeyi oluştur"}
        </button>
      </form>
    </div>
  );
}