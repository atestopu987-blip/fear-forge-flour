# AI Korku Hikayesi Video Üretim Uygulaması — MVP Planı

Bu PRD çok kapsamlı (tam otomasyon, zamanlanmış yayın, sosyal medya yükleme, video render, ses klonlama…). Hepsini tek seferde inşa etmek gerçekçi değil. Aşağıda **çalışan bir MVP**'yi Lovable üzerinde kuracak plan var; sonraki fazlar için iskeleti hazır bırakıyoruz.

## MVP Kapsamı (bu turda yapılacak)

1. **Kimlik doğrulama** — Lovable Cloud ile e-posta/şifre + Google girişi.
2. **Proje oluşturma** — Konu, ton, süre, görsel stil, format (9:16 / 1:1 / 16:9), dil.
3. **Senaryo üretimi** — Lovable AI Gateway (`google/gemini-3-flash-preview`) ile JSON sahne çıktısı; sahne düzenleme ekranı.
4. **Seslendirme** — Lovable AI TTS (`openai/gpt-4o-mini-tts`) ile sahne bazlı ses üretimi ve önizleme. (ElevenLabs'e geçiş sonraki faz — connector eklenince tek noktadan değişir.)
5. **Görsel üretim** — Lovable AI (`google/gemini-3.1-flash-image`) ile sahne başına 1 görsel, seçilen stil promptu tüm sahnelere eklenerek tutarlılık.
6. **İlerleme takibi** — Her sahnenin durumu (senaryo/ses/görsel) canlı UI'da; yeniden üret butonu.
7. **Video montajı** — MVP'de **tarayıcı içi oynatıcı** (sahne görsel + ses eşleşmiş, sıralı oynatma, altyazı overlay). Gerçek MP4 render (Shotstack/Creatomate/FFmpeg) Faz 2'ye bırakılır — çünkü ödemeli 3. taraf API + connector gerekir ve seni bir karara zorlar.
8. **Dashboard** — Kullanıcının projeleri, durum, hızlı "Yeni Video".

## Sonraki Fazlara Bırakılanlar (yapılmayacak)

- Shotstack/Creatomate ile gerçek MP4 render ve indirme
- Whisper ile kelime-kelime altyazı
- Ses klonlama, ElevenLabs entegrasyonu
- Runway/Kling animasyon
- Zamanlanmış otomasyon (pg_cron), tam otomatik pipeline
- TikTok/YouTube/Instagram otomatik yükleme
- Konu tekrar önleyici AI konu üretici
- Maliyet/kullanım paneli

Bunların hepsi eklenebilir; ilk sürümü çalışır ve gösterilebilir tutmak için dışarıda tutuyorum.

## Teknik Yaklaşım

- **Stack:** TanStack Start + Lovable Cloud (Supabase). AI için Lovable AI Gateway — kullanıcının API key girmesine gerek yok.
- **Server functions:** `createServerFn` — `generateScript`, `generateVoice(sceneId)`, `generateImage(sceneId)`, `createProject`. `requireSupabaseAuth` middleware ile korunur.
- **Storage:** Supabase Storage `scene-assets` bucket'ı (private), imzalı URL'ler ile UI'ya sunulur.
- **DB tabloları:** `projects`, `scenes`, (opsiyonel) `voice_profiles`. RLS politikaları + `user_roles` deseni.
- **UI:** Karanlık, "korku" temalı bir design system — muted kırmızı aksan, koyu arka plan, mono/serif başlıklar.

## Veri Modeli (özet)

```text
projects(id, user_id, baslik, konu, ton, hedef_sure, gorsel_stili,
         format, dil, durum, created_at)
scenes(id, project_id, sira, anlatim, gorsel_prompt, ses_efekti,
       ses_url, ses_suresi, gorsel_url, durum)
```

RLS: her kullanıcı yalnızca kendi `projects` ve `scenes` satırlarını okur/yazar.

## Ekranlar

1. `/auth` — giriş/kayıt (e-posta + Google)
2. `/` — public landing
3. `/_authenticated/dashboard` — projeler listesi + "Yeni Proje"
4. `/_authenticated/projects/new` — form
5. `/_authenticated/projects/$id` — sahneler, ses/görsel üret butonları, ilerleme
6. `/_authenticated/projects/$id/preview` — sahne bazlı slayt oynatıcı (ses + görsel + altyazı)

## Onay Bekliyorum

Bu MVP kapsamını onaylarsan başlıyorum. Değiştirmek istediğin bir şey varsa (örn. "TTS yerine hemen ElevenLabs bağla", "video render şart, Shotstack API key'i vereceğim", "önce sadece senaryo + ses yeter") söyle, plana göre güncelleyeyim.
