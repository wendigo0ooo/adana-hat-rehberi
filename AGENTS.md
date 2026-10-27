# AGENTS.md — Adana Hat Rehberi (proje hafızası)

Bu dosya, sonraki oturumlarda projeyi hatırlamak için tutulur. Yeni kararlar
alındığında burayı güncelle.

## Proje

Adana'daki belediye otobüsleri, dolmuş/minibüs hatları ve M1 metro için
güzergah + durak + sefer saati gösteren, çevrimdışı çalışan Android uygulaması.

- Depo: `~/adana-hat-rehberi` (GitHub: `wendigo0ooo/adana-hat-rehberi`, public)
- Mimari: **vanilla JS + Leaflet** web uygulaması (`www/`) + **Kotlin WebView kabuğu**
  (`android/`). `assets.srcDirs("../../www")` ile `www/` doğrudan APK'ya gömülür.
  Aynı `www/` klasörü PWA olarak da çalışır.
- Veri, `www/data/network.js` içinde `window.ADANA_DATA` olarak gömülüdür
  (fetch/CORS gerektirmez). `routes.json` / `stops.json` gitignore'da, sadece
  yerel üretim içindir.
- APK **GitHub Actions** ile derlenir (`.github/workflows/build.yml`):
  test → `assembleDebug` + `assembleRelease` → artifact + GitHub Release.

### Neden Flutter/RN/Capacitor değil
Veri statik JSON, UI ~60 KB JS, harita Leaflet. Flutter/React Native'e geçmek
sıfır işlevsel kazanç için tüm arayüzü yeniden yazmak demek. Mevcut WebView
kabuğu Capacitor'ün yaptığı işi (konum izni + JS köprüsü) zaten yapıyor.
**Taşıma yapma.**

## Sayılar (son veri: 2026-10-25, GTFS geçerlilik 2026-10-01 → 2026-11-30)

- 189 hat (100 otobüs + 88 dolmuş + 1 metro + 56 "sınırlı"), 330 yön
- 3.626 durak, 13 M1 metro istasyonu

## Veri kaynakları

1. **ABB Ulaşım Bilgi Sistemi** — `https://ulasimbilgi.adana.bel.tr`
   - `POST /api/buses` → hat/yön listesi (belediye otobüsü, 98 hat)
   - `POST /api/buses/{id}` → sefer saatleri (weekday/saturday/sunday)
   - `GET /api/buses/map/{id}` → güzergah polylines + sıralı duraklar
     (**`Accept: application/json` şart**, yoksa 405)
   - `GET /api/stops` → 4.835 durak, `GET /api/metro` → metro
   - `POST /api/announcements` → ek servis / güzergah duyuruları
   - **Dolmuş YOK.**
2. **KentKart API** — `https://service.kentkart.com/rl1` (region=003)
   - Dolmuş dahil 280 hat: `/web/pathInfo?region=003&displayRouteCode=...&direction=0|1`
   - `displayRouteCode` başında **sıfır olmadan** gönderilmeli (`125`, `00125` değil).
3. **kk-gtfs `adana.zip`** — `Egezenn/kk-gtfs` (aylık üretilen GTFS, 291 hat,
   60 dolmuş). Toplama CC0 ama alt veri ABB/KentKart'a ait.
4. `data-src/` (gitignored, ~9,6 MB): GTFS, `official_stops.json`,
   `official_routes/` (109 JSON), metro JSON'ları. **Yedeklemesi ayrı tutulmalı.**

Bilinen veri kusurları: KentKart `agencyId` ~15 dolmuşta yanlış ("Adana BB -
Otobus"); 5 haneli hat kodu = dolmuş ayırt edicisi. "Cep durak" verisi hiçbir
kaynaktta yok.

## Komutlar

```bash
cd ~/adana-hat-rehberi
npm test                     # validate + veri + jsdom UI testleri
./basla.sh                   # http://localhost:8080 yerel önizleme
python3 tools/build_data.py  # data-src -> www/data (ağdan çeker, dikkat)
```

APK'yı yerelde derlemek Termux'te mümkün ama zahmetli (Android cmdline-tools +
Gradle 8.7 + aapt2 override gerekir). **Birincil yol CI.**

## Durum / yapılanlar

- [x] Uygulama tamamlandı: arama (TR karakter duyarsız), tür filtresi, durak
      listesi, hafta içi/Cmt/Paz kalkış saatleri, doğrudan + 1 aktarmalı
      yolculuk planlama, Leaflet harita (çevrimdışı şematik + OSM), favoriler,
      son bakılanlar, konumla yakın duraklar, karanlık mod, PWA.
- [x] Testler yeşil (Pazar sekmesi testi tarih bağımlıydı, düzeltildi).
- [x] GitHub deposu açıldı, ilk commit atıldı, CI APK üretiyor.
- [x] Dedicated release keystore üretildi ve repo secret'larına eklendi.
- [ ] İleride: GTFS yenileme (2026-11-30 sonrası), dolmuş attribution
      düzeltmeleri, cep durak katkısı, canlı araç konumu (opsiyonel, KVKK:
      plaka verisi saklanmamalı).

## Güvenlik / sırlar (asla commit etme)

- GitHub token: `~/.config/gh/hosts.yml` (gh CLI bunu kullanıyor).
  Eski token `~/zifiri/.git/config` remote URL'sinde duruyordu; **rotate
  edilmesi önerilir**, sonra `git -C ~/zifiri remote set-url origin
  https://github.com/wendigo0ooo/zifiri.git`.
- Release imza anahtarı: `~/adana-signing/release.jks` + `credentials.txt`
  (chmod 600). Aynı değerler repo secret'larında:
  `RELEASE_KEYSTORE_BASE64`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`
  (`adana`), `RELEASE_KEY_PASSWORD`.
- `com.wendigo.adanahat` paketi için ayrı keystore kullanılıyor; qibla
  keystore'u ile karıştırma.
