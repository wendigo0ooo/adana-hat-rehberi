# Adana Hat Rehberi — Yol Haritası

Son güncelleme: 2026-10-27 · Sürüm: v1.0-build4
Bu dosya, iki bağımsız denetimin (kod + dış araştırma) birleştirilmiş sonucudur.
Her oturumda önce bunu, sonra `AGENTS.md`'yi oku.

## Mevcut durum

- 189 hat / 330 yön / 3.626 durak; 56 hat "sınırlı" olarak işaretli.
- Mimari: vanilla JS + Leaflet (`www/`) + Kotlin WebView kabuğu (`android/`).
  Veri `www/data/network.js` içinde gömülü, backend yok, çevrimdışı çalışıyor.
- APK her `main` push'unda GitHub Actions'ta imzalı üretiliyor.
- Testler: `validate` + veri testleri + jsdom arayüz testleri (gerçek Leaflet
  semantiği ile) yeşil.

## İlkeler (değişmesin)

1. **WebView mimarisi kalır.** Flutter/RN/Capacitor'a geçiş sıfır işlevsel kazanç
   için tüm arayüzü yeniden yazmak demek.
2. **Backend yok.** Veri statik paket + zamanlanmış CI ile güncellenir.
3. **Hesap, reklam, analytics, push yok.** Play Data Safety formunu "veri
   toplanmıyor" olarak tutabilmek en büyük avantajımız.
4. **Canlı araç konumu çekirdek özellik değil.** Resmî olmayan API'ye bağımlı,
   plaka = kişisel veri; yalnızca opsiyonel ve plaka göstermeden.

## Öncelik özeti

| Öncelik | Konu | Etki | Efor |
|---|---|---|---|
| P0 | Hafta sonu/sefer dürüstlüğü | 5 | M |
| P0 | Veri tazeliği + 30 Kasım GTFS bitişi | 5 | S |
| P0 | CI Node 20 → 24 | 5 | S |
| P0 | Arama debounce + APK boyutu | 4 | S |
| P1 | 56 "sınırlı" hattı gerçek veriyle doldur | 5 | L |
| P1 | Yakınlık tabanlı aktarma + durak gruplama | 5 | L |
| P1 | Gece 24:00+ ve saat dilimi düzeltmesi | 3 | M |
| P1 | Duyurular (ek servis / güzergah / tarife) | 5 | S |
| P2 | Konumdan hedefe yolculuk + yürüme bacağı + saatli bacaklar | 5 | M |
| P2 | Erişilebilirlik (yazı boyutu, kontrast, combobox) | 4 | M |
| P2 | targetSdk 36 + predictive back + edge-to-edge | 3 | M |
| P2 | WebViewAssetLoader + CSP + güvenlik sertleştirme | 4 | M |
| P3 | Play Store yayını + kapalı test | 5 | M |
| P3 | Paylaşım / deep link / widget / canlı konum | 3-4 | M-L |

---

## Faz 0 — Acil ve güven (≈1 hafta)

Amaç: yanlış bilgi göstermeyi bırakmak ve 30 Kasım veri bitişine hazırlanmak.

1. **Hafta sonu dürüstlüğü** (C-02)
   - `stopsTimeline` içindeki `if (!dep.length) dep = wd` fallback'ini kaldır.
   - Sefer yoksa durak saat kolonunu gösterme; "Bu hat Cumartesi/Pazar
     çalışmıyor" uyarısı ver.
   - `stats()` gerçekten kullanılan günü döndürsün; "İlk sefer 06:00 Cumartesi"
     yalanı bitsin.
   - `plan()` ve `waitEstimate()` güne duyarlı olsun.
   - Kabul: cumartesi saatli bir testte hiçbir `.time` ve hiçbir sahte
     "Cumartesi" istatistiği görünmüyor.

2. **Veri tazeliği** (Q-05, U-05)
   - `meta.feed.validUntil` geçmişse ana sayfada ve hat sayfasında "Veri
     güncelliği" rozeti.
   - `validate_project.py` geçerlilik tarihi geçmişse uyarı/fail.
   - Kabul: 2026-11-30'dan sonra build uyarı veriyor, uygulama sessiz kalmıyor.

3. **CI Node 20 temizliği** (Q-08)
   - `actions/checkout@v7`, `setup-node@v7` (`node-version: 24`),
     `setup-java@v5`, `upload-artifact@v5`.
   - `permissions` job bazında daralt, release yalnızca tag'de.
   - Kabul: workflow uyarısız, yeşil.

4. **Arama debounce** (P-01): ana sayfa aramasını 130 ms debounce et.

5. **APK boyutu** (P-06): `www/data/*.json` dosyaları APK'ya girmesin
   (`assets.srcDirs` filtresi veya ara dosyaları `www/` dışına yaz).
   CI'a APK boyut bütçesi ekle.

6. **Kontrast + dokunma hedefleri** (A-02/A-03): `--brand #0f766e`,
   `--minibus #b45309`, `--muted #475569`; chip/sekme en az 44 px.

## Faz 1 — Veri doğruluğu ve planlayıcı (≈2-3 hafta)

Amaç: uygulamanın "eksik" dediği hatları gerçekten göstermek ve aktarmaları
düzeltmek.

1. **56 sınırlı hattı doldur** (C-01)
   - `data-src/official_routes/` zaten 105/111 yönde durak + geometri + saat
     içeriyor; `tools/build_data.py` ile `network.js` yeniden üret.
   - Per-route değil **per-direction** `dataLevel: full | stops-only | none`.
   - `stops-only` yönlerde durak listesi + harita göster, sahte varış saati
     üretme; "yalnız kalkış saatleri" etiketi kullan.
   - ABB durak ID'leri GTFS ile ayrı isim uzayında: aktarma için Faz 1.2'deki
     yakınlık indeksi şart. Aksi halde yeni hatlar bağlantısız kalır.
   - `validate_project.py` / `test_data.js` "sınırlı = boş" varsayımını bırak.
   - Kabul: en az 100 yönde durak listesi + harita; hiçbir uydurma saat yok.

2. **Yakınlık tabanlı aktarma + durak gruplama** (C-03, C-04)
   - Yükleme anında: `dir.indexByStop`, 200 m grid ile `stopNeighbors`,
     normalize isimle `hubGroups`.
   - `plan()` aktarmayı ≤150 m komşuluk + isim uyumu ile bulsun; karşı yön
     ("1A"/"1B") çiftlerini ayırsın; düz `+4 dk` yerine yürüme süresi.
   - Aynı adlı 82 durak için sonuçlarda yön/mesafe/hat kodu ayırt edicisi.
   - Kabul: "KÜÇÜK SAAT" durağından metroya en az 1 yolculuk; rastgele 100
     çiftte sonuçsuzluk %84'ten belirgin şekilde düşer.

3. **Gece seferleri ve saat dilimi** (C-05, C-06)
   - 24:00+ seferleri `% 1440` ile kırma; `25:30 (+1 gün)` olarak sakla/göster.
   - `todayKey` ve "şimdi" hesabını Europe/Istanbul sabit dilimine bağla;
     cihaz saat dilimi testi ekle.

4. **Duyurular** (N-05 hafif sürüm)
   - CI'da `POST /api/announcements` çek; kategori + hat eşlemesi ile
     `announcements.json` üret.
   - Ana sayfada banner, ayrı "Duyurular" listesi; favori hatları etkileyen
     duyuru varsa öne çıkar.
   - Kabul: ek servis / güzergah kapama / tarife duyuruları uygulamada.

5. **Ücretler** (C-07): hat sayfasında moda göre ücret, kaynak ve geçerlilik;
   `null` nakit için "nakit kabul edilmiyor"; `faresValidFrom` eskidiyse uyarı.

6. **Operatör düzeltmesi** (U-04): "Dolmuş kooperatifleri" altında yanlış
   görünen 38 dolmuşu ayır.

7. **Veri boru hattı** (Q-01, Q-02)
   - `tools/fetch_sources.py`: `adana.zip` + ABB `/api/buses`, `/api/stops`,
     `/api/metro`, `official_routes`.
   - Aylık `workflow_dispatch`: çek → doğrula → diff → **PR aç** (asla otomatik
     merge). Eşikler: `routes ≥ 150`, `stops ≥ 3000`, `directions ≥ 300`.
   - Mobility Database `mdb-3407` ikinci kaynak olarak kullanılsın.

## Faz 2 — Kullanıcı akışı ve erişilebilirlik (≈3 hafta)

1. **Konumdan hedefe yolculuk** (U-01)
   - Plan formuna "Konumumu kullan" butonu; en yakın durağı otomatik seç;
     binilecek durağa yürüme mesafesi/süresi göster.
2. **Saatli, adım adım bacaklar** (U-02)
   - Her bacak için kalkış/varış saati, aktarma beklemesi, yürüme bacağı.
   - "Şu an çıksan" senaryosu; sonraki 3 sefer alternatifi.
3. **Erişilebilirlik** (A-01, A-04, A-05)
   - `textZoom` sabitini kaldır, `rem` tabanlı ölçek, uygulama içi yazı boyutu.
   - Plan otomatik tamamlama gerçek combobox/listbox + ok tuşları + ARIA.
   - Saat ızgarası liste semantiği, haritaya metin alternatifi, aktif sekmeye
     `aria-current`.
4. **Güvenlik sertleştirme** (S-01, S-02, N-06)
   - CSP; inline script'i dosyaya taşı; `allowContentAccess=false`; yalnızca
     kendi asset öneki için `file://`; `JSONObject.quote()`; release'te log kapalı;
     `dataExtractionRules` ile yedekleme kapsamı.
5. **Platform** (N-01, N-02, N-04)
   - `compileSdk/targetSdk 36`, AGP/Gradle yükselt; edge-to-edge inset'leri;
     `OnBackPressedCallback`; `launchMode="singleTask"`.
   - `WebViewAssetLoader` (`https://appassets.androidplatform.net/`) ile
     güvenli origin; `fetch` ve service worker yolu açılır.
6. **Paylaşım / deep link** (U-03): `ACTION_SEND`, `adanahat://` + App Links,
   favori dışa aktarma.

## Faz 3 — Yayın ve otomasyon (≈1-2 ay)

1. **Play Store**: $25 hesap, AAB, targetSdk 36, Data Safety ("veri
   toplanmıyor"), gizlilik politikası URL'si + uygulama içi bağlantı, konum
   beyanı, içerik derecelendirmesi. Kişisel hesapta **12 testers × 14 gün**
   kapalı test şartı var; 14 günlük saati erken başlat.
2. **Konum kapsamı kararı**: yalnız `ACCESS_COARSE_LOCATION` yeterli mi?
   FINE kalacaksa 2026 Kasım'da açılan Play beyanına hazır ol.
3. **CI sertleştirme**: iki kez derle + karşılaştır, R8/shrinkResources,
   dependency locking, `dependenciesInfo { includeInApk = false }`, SHA-256
   ve attestation.
4. **Lint/format**: ESLint + ktlint/detekt; `npm test` içine bağla.
5. **Topluluk düzeltmeleri**: GitHub Issue formları (hat/durak/saat, ücret),
   uygulamada "Bunu bildir" → ön doldurulmuş issue; OSM düzeltme bağlantısı.
6. **Widget**: favori duraktan sonraki 2-3 sefer (RemoteViews + snapshot).
7. **Canlı araç (opsiyonel)**: varsayılan kapalı, 15-30 sn, **plaka
   gösterilmez/saklanmaz**, boş yanıtta programa düşer.

## Yapılmayacaklar

- MBTiles/vector tile'ı APK'ya gömmek (50-300 MB). Şematik harita + OSM yeterli.
- Flutter/RN/Capacitor'a geçmek.
- Backend, hesap, analytics, reklam, push eklemek.
- Crashlytics/Sentry'yi şimdi eklemek (Play vitals + "hata bildir" yeterli).
- Canlı konumu çekirdek özellik yapmak; plaka göstermek.
- Veri güncellemesini otomatik merge etmek (PR + insan onayı şart).
- EAA'yı zorunluluk sanmak (kentsel toplu taşıma kapsam dışı).

## Release kontrol listesi

- [ ] `npm test` yeşil
- [ ] `meta.feed.validUntil` gelecekte
- [ ] Cumartesi/Pazar görünümü saat uydurmuyor
- [ ] Harita + konum gerçek cihazda çalışıyor
- [ ] APK boyutu bütçe içinde
- [ ] `apksigner verify` geçiyor
- [ ] Sürüm numarası Info sekmesinde görünüyor

## Önerilen ilk üç iş

1. **Hafta sonu dürüstlüğü** (yanlış sefer göstermek en büyük güven kaybı).
2. **Veri tazeliği rozeti + 30 Kasım uyarısı** (takvim çok yakın).
3. **CI Node 24 + arama debounce + APK boyutu** (hızlı, düşük riskli kazançlar).
