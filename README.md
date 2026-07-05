# Karanlık Anlatı — AI Hikaye Stüdyosu

Tek bir konu girin; uygulama otomatik olarak senaryo yazar, seslendirir, sahne görselleri üretir ve profesyonel CapCut yönetmen rehberi çıkarır. Tarayıcı içinde sinematik video render'ı ve tüm varlıkların ZIP olarak indirilmesi dahildir.

## Özellikler

- Sınırsız hikaye ve senaryo üretimi (Türkçe)
- Sahne bazlı görsel + seslendirme üretimi
- Sinematik video render (Ken-Burns, crossfade, karaoke altyazı, vignette, grain)
- Profesyonel CapCut Yönetmen Rehberi (timeline, kamera, LUT, geçişler, efektler)
- İndirilebilir formatlar: PNG, MP3, JSON, TXT, MD, PDF, ZIP
- Girişsiz kullanım (anonim oturum)
- Mobil uyumlu indirme (iOS Safari / Android Chrome — Dosyalar/Downloads klasörüne kaydeder)

## Geliştirme

```bash
npm install     # veya bun install
npm run dev
```

`http://localhost:8080` adresini açın.

## Build

```bash
npm run build
npm run start
```

## Ortam Değişkenleri

`.env` dosyasında:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
LOVABLE_API_KEY=...       # AI Gateway (senaryo/görsel/seslendirme)
```

`LOVABLE_API_KEY` yerine kendi OpenAI/Anthropic anahtarınızı kullanmak isterseniz `src/lib/lovable-ai.server.ts` içindeki `BASE` URL'ini ve header'ları güncelleyin.

## Dağıtım

Standart Vite/TanStack Start çıktısıdır; Vercel, Netlify, Cloudflare Workers veya kendi Node sunucunuza dağıtılabilir. `npm run build` sonrası `.output/` klasörü yeterlidir.

## Yapı

- `src/routes/` — TanStack Start file-based routing
- `src/lib/projects.functions.ts` — sunucu tarafı AI çağrıları
- `src/lib/render-video.ts` — tarayıcı içi video render
- `src/lib/downloads.ts` — ZIP/PDF/MD/TXT/JSON indirme yardımcıları
- `supabase/migrations/` — DB şeması

## Lisans

MIT
