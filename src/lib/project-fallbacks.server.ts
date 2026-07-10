type ProjectLike = {
  baslik: string;
  konu: string;
  ton: string;
  hedef_sure: number;
  gorsel_stili: string;
  format?: string;
};

type SceneLike = {
  sira: number;
  anlatim: string;
  gorsel_prompt?: string | null;
};

type SceneOut = {
  sira: number;
  anlatim: string;
  gorsel_prompt: string;
  ses_efekti?: string;
};

const STYLE_PROMPTS: Record<string, string> = {
  karanlik_karikatur: "dark cartoon illustration, thick outlines, cinematic shadows",
  "2d_animasyon": "2D animated short film frame, cel shaded, dynamic lighting",
  gercekci_illustrasyon: "realistic cinematic illustration, dramatic lighting, rich textures",
  cizgi_film: "stylized cartoon frame, expressive character design, playful contrast",
  cop_adam: "black stick figure doodle on white notebook paper, hand drawn marker style",
  kagit_fonlu: "paper craft collage on textured notebook paper, marker doodle details",
};

function cleanTopic(project: ProjectLike) {
  return project.konu.replace(/^\[ATASÖZÜ\]\s*/i, "").trim() || project.baslik;
}

function visualPrompt(project: ProjectLike, scene: string, index: number) {
  const style = STYLE_PROMPTS[project.gorsel_stili] ?? STYLE_PROMPTS.gercekci_illustrasyon;
  const frame = project.format === "16:9" ? "wide horizontal composition" : project.format === "1:1" ? "square social composition" : "vertical 9:16 social video composition";
  return `${style}, ${frame}, ${scene}, expressive composition, cinematic color grade, soft motion feeling, family-safe, no graphic violence, no explicit nudity, scene ${index}`;
}

export function buildFallbackScript(project: ProjectLike): { sahneler: SceneOut[] } {
  const topic = cleanTopic(project);
  const isAtasozu = project.konu.trim().startsWith("[ATASÖZÜ]");
  const isFun = project.ton === "eglence";
  const isPlus18 = project.ton === "plus18";
  const count = isAtasozu ? 5 : Math.max(4, Math.min(8, Math.round(project.hedef_sure / 18)));

  if (isAtasozu) {
    const beats = [
      `Bir zamanlar küçük bir kasabada herkesin dilinde aynı soru vardı: “${topic}” sözü nereden çıkmıştı? Yaşlılar susuyor, gençler ise bu sözün peşine düşüyordu.`,
      `Pazar yerinde yaşanan küçük bir olay, köyün bütün dengesini değiştirdi. Birinin acele kararı, diğerlerinin kaderine ders gibi yazıldı.`,
      `O gece herkes gördüğünü farklı anlattı; ama olayın özü aynıydı. İnsan, bazen en büyük gerçeği en basit hatasında öğrenirdi.`,
      `Sabah olduğunda köyün en bilge kişisi olanları tek cümleyle özetledi. O cümle, yıllarca ağızdan ağıza dolaşıp bugüne kadar geldi.`,
      `İşte bu yüzden büyüklerimiz “${topic}” der. Çünkü bu söz, yalnızca bir öğüt değil; yaşanmış bir hikâyenin kısa hâlidir.`,
    ];
    return {
      sahneler: beats.map((anlatim, i) => ({
        sira: i + 1,
        anlatim,
        gorsel_prompt: visualPrompt(project, `old Anatolian village proverb origin story, scene about ${topic}`, i + 1),
        ses_efekti: i === 0 ? "hafif bağlama ve rüzgar" : "yumuşak ortam sesi",
      })),
    };
  }

  const open = isFun
    ? `Dur, bunu duyunca “yok artık” diyeceksin: ${topic} bir anda herkesin konuştuğu en komik olaya dönüştü.`
    : isPlus18
      ? `Bu hikâye biraz flörtöz, biraz oyunbaz; ${topic} yüzünden herkesin bakışı bir anda değişti.`
      : `Bunu kimseye anlatmadım ama ${topic} başladığı gece, ortalıkta açıklayamadığımız bir his vardı.`;
  const middleTone = isFun
    ? "Her yeni detay, olayı daha da absürt ve eğlenceli hâle getirdi. Kimse ciddiyetini koruyamadı."
    : isPlus18
      ? "İmalar havada uçuştu, bakışlar uzadı, ama her şey zarif ve komik bir oyunun içinde kaldı."
      : "Her adımda ortam biraz daha sessizleşti; cevap yaklaştıkça gölgeler daha anlamlı görünmeye başladı.";
  const close = isFun
    ? "Sonunda herkes kahkahaya boğuldu; çünkü olayın sırrı korkulacak değil, paylaşılacak kadar komikti."
    : isPlus18
      ? "Finalde herkes gülümsedi; çünkü bazen en akılda kalan hikâye, açık söylemeden hissettiren hikâyedir."
      : "Finalde anladık ki bizi takip eden şey bir canavar değil, sakladığımız gerçeğin kendi yankısıydı.";

  const templates = [
    open,
    `${middleTone} İlk ipucu beklenmedik bir yerde ortaya çıktı ve herkesi hikâyenin içine çekti.`,
    `Tam olay çözüldü sanılırken küçük bir ayrıntı bütün sahneyi tersine çevirdi. İzleyen herkes bir sonraki saniyeyi merak etti.`,
    `${middleTone} Kamera gibi düşün: yakın planlar, hızlı kesmeler ve güçlü ifadeler hikâyeyi canlı tuttu.`,
    `Doruk noktasında karakterler tek bir seçim yapmak zorunda kaldı. O seçim, bütün hikâyenin anlamını değiştirdi.`,
    close,
    `Son karede geriye sadece güçlü bir duygu kaldı: anlatılmaya değer, kısa ama akılda kalan bir final.`,
    `Ekran kararırken izleyici şunu düşündü: “Bunu birine göndermem lazım.”`,
  ].slice(0, count);

  return {
    sahneler: templates.map((anlatim, i) => ({
      sira: i + 1,
      anlatim,
      gorsel_prompt: visualPrompt(project, `${project.baslik}, ${topic}, cinematic short story beat`, i + 1),
      ses_efekti: isFun ? "tempolu komik geçiş" : isPlus18 ? "yumuşak pop ritmi" : "düşük ambient gerilim",
    })),
  };
}

export type DirectorSceneFallback = {
  sira: number;
  sure_sn: number;
  timeline_baslangic: string;
  mekan: string;
  atmosfer: string;
  kamera_acisi: string;
  kamera_hareketi: string;
  karakter_hareketi: string;
  duygu: string;
  ses_efektleri: string[];
  muzik_onerisi: string;
  anlatici_metni: string;
  diyalog: string;
  gorsel_prompt: string;
  video_prompt: string;
  gecis_efekti: string;
  zoom: string;
  blur: string;
  motion_blur: string;
  shake: string;
  glow: string;
  color_grading: string;
  lut: string;
  film_grain: string;
  vignette: string;
  altyazi_stili: string;
  yazi_animasyonu: string;
  fade_sn: string;
};

function fmtTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function buildFallbackDirectorGuide(project: ProjectLike, scenes: SceneLike[]): DirectorSceneFallback[] {
  const perScene = Math.max(4, Math.round(project.hedef_sure / Math.max(1, scenes.length)));
  return scenes.map((scene, i) => ({
    sira: scene.sira,
    sure_sn: perScene,
    timeline_baslangic: fmtTime(i * perScene),
    mekan: "Sahne anlatımına uygun ana mekân; arka plan sade, konu net görünsün.",
    atmosfer: project.ton === "eglence" ? "neşeli, hızlı ve parlak" : project.ton === "plus18" ? "flörtöz, sıcak ve zarif" : "gizemli, sinematik ve atmosferik",
    kamera_acisi: i % 2 === 0 ? "close-up" : "wide angle",
    kamera_hareketi: i % 2 === 0 ? "slow dolly in" : "gentle pan right",
    karakter_hareketi: "Anlatımdaki ana duyguya göre küçük ama okunaklı hareketler.",
    duygu: project.ton === "eglence" ? "merak + komedi" : project.ton === "plus18" ? "oyunbaz merak" : "gerilim + merak",
    ses_efektleri: project.ton === "eglence" ? ["pop", "whoosh"] : ["ambient pad", "soft whoosh"],
    muzik_onerisi: project.ton === "eglence" ? "hızlı, neşeli beat" : "düşük tempolu sinematik ambient",
    anlatici_metni: scene.anlatim,
    diyalog: "Gerekirse ekranda kısa vurucu replik olarak kullan.",
    gorsel_prompt: scene.gorsel_prompt ?? visualPrompt(project, scene.anlatim, scene.sira),
    video_prompt: "Görseli hafif zoom, pan ve parallax hissiyle 4-6 saniyelik hareketli plana dönüştür.",
    gecis_efekti: i % 2 === 0 ? "cross dissolve" : "whip pan",
    zoom: "1.0 → 1.12 yavaş",
    blur: "arka planda hafif 2px",
    motion_blur: "düşük",
    shake: project.ton === "eglence" ? "çok düşük" : "hafif",
    glow: "önemli objede soft glow",
    color_grading: project.ton === "eglence" ? "canlı renkler, sıcak kontrast" : "teal-orange, gölgeler derin",
    lut: project.ton === "eglence" ? "Vibrant Social" : "Cinematic Mystery",
    film_grain: "hafif",
    vignette: "orta",
    altyazi_stili: "beyaz kalın yazı, aktif kelime sarı vurgu, gölge açık",
    yazi_animasyonu: "kelime kelime pop-in",
    fade_sn: "in 0.3 / out 0.3",
  }));
}