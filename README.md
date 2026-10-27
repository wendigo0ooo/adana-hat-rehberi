# Adana Hat Rehberi

Adana'daki belediye otobüsleri, dolmuş/minibüs hatları ve M1 metro güzergahlarını
gösteren, çevrimdışı çalışan halk ulaşım rehberi. Web arayüzü + Android WebView
kabından oluşan hibrit bir uygulamadır; APK GitHub Actions'ta derlenir.

## Özellikler

- 189 hat / 330 yön / 3.626 durak + M1 metro (13 istasyon)
- Hat ve durak araması (Türkçe karakter duyarsız), tür filtresi
- Durak listesi, kalkış saatleri (hafta içi / cumartesi / pazar)
- Doğrudan ve 1 aktarmalı yolculuk planlama
- Leaflet haritası: çevrimdışı şematik zemin + isteğe bağlı OpenStreetMap
- Favoriler, son bakılanlar, konumla yakın duraklar
- Karanlık mod, mobil öncelikli arayüz, PWA/service worker desteği

## Yapı

```
www/                 Arayüz (APK'da doğrudan asset olarak kullanılır)
  data/network.js    Gömülü veri: window.ADANA_DATA (fetch/CORS gerektirmez)
  js/data.js         Arama, durak indeksi, yolculuk planlama
  js/app.js          Hash tabanlı router ve ekranlar
  js/ui.js           HTML parçaları ve biçimlendirme
  js/map.js          Leaflet haritaları
android/             Gradle + Kotlin WebView kabı
tools/               Veri üretimi ve doğrulama/test betikleri
data-src/            Ham GTFS ve API yanıtları (commit edilmez)
.github/workflows/   APK derleme ve sürüm yayınlama
```

Android tarafı `assets.srcDirs("../../www")` ile `www/` klasörünü doğrudan
APK'ya gömer; giriş `file:///android_asset/index.html` adresidir.

## Yerelde çalıştırma

```bash
./basla.sh          # http://localhost:8080
```

Dosyayı doğrudan (`file://`) açmak da çalışır; veri gömülü olduğu için ağ gerekmez.
Haritada "Sokak haritası" seçilirse internet ve OpenStreetMap karoları kullanılır.

## Testler

```bash
npm install
npm test
```

- `tools/validate_project.py`: veri bütünlüğü + proje/CI yapılandırma kontrolü
- `tools/test_data.js`: arama, planlama, metro, tarife testleri
- `tools/smoke_test.js`: jsdom ile arayüz akışları (ana sayfa, hat, durak, plan, favori)

## Veriyi yenileme

```bash
python3 tools/build_data.py
python3 tools/make_icons.py
npm test
```

Veriyi sıfırdan üretmek için:

```bash
python3 tools/fetch_sources.py            # GTFS + ABB hat/durak/metro
python3 tools/fetch_official_limited.py   # resmî hat durak/geometri/sefer
python3 tools/fetch_announcements.py      # ek servis / güzergah duyuruları
python3 tools/build_data.py               # www/data/network.js
```

`.github/workflows/data.yml` bu akışı ayda bir çalıştırır, testleri geçirir ve
değişiklik varsa PR açar (otomatik merge yoktur).

`build_data.py`, `data-src/` altındaki GTFS ve resmî API yanıtlarını okur;
uygulamanın kullandığı `www/data/network.js` dosyasını ve yalnızca yerel
denetim için `build/data/*.json` ara dosyalarını üretir. Ara JSON'lar APK'ya
girmez. GTFS kaynağı
[Egezenn/kk-gtfs](https://github.com/Egezenn/kk-gtfs) (CC0 derleme), resmî
bilgiler [Adana Ulaşım Bilgi](https://ulasimbilgi.adana.bel.tr/) sisteminden alınır.
Ücretler ve geçerlilik tarihleri `www/data/meta.json` içinde kaynaklarıyla tutulur.

## APK derleme

GitHub'a push edildiğinde `.github/workflows/build.yml` çalışır:

- JDK 17 + Gradle 8.7, `android/` dizininde `assembleDebug` ve `assembleRelease`
- APK'lar artifact olarak yüklenir; push'ta `v1.0-build<N>` etiketiyle release eklenir
- Debug APK imzalıdır ve doğrudan kurulabilir

Release imzası için depo ayarlarında şu secret'lar tanımlanmalıdır:

| Secret | Açıklama |
| --- | --- |
| `RELEASE_KEYSTORE_BASE64` | Keystore dosyasının base64 hali |
| `RELEASE_STORE_PASSWORD` | Keystore parolası |
| `RELEASE_KEY_ALIAS` | Anahtar takma adı |
| `RELEASE_KEY_PASSWORD` | Anahtar parolası |

```bash
base64 -w0 release.jks   # çıktıyı RELEASE_KEYSTORE_BASE64 olarak ekleyin
```

Secret yoksa release APK imzasız kalır ve yayınlanmaz; dağıtım için debug APK kullanılır.

## Notlar

- Uygulama resmî değildir; resmî bilgi için Adana Büyükşehir Belediyesi kanallarına bakın.
- GTFS'te seferi olmayan 159 rota dışlanmış, resmî listede aktif olan 56 hat
  "Sınırlı veri" olarak yalnız kod/yön bilgisiyle gösterilmiştir.
- OpenStreetMap karoları kendi kullanım politikasına tabidir; yoğun kullanımda
  kendi tile sunucunuzu veya sağlayıcınızı kullanın.
- Android SDK bu geliştirme ortamında yoktur; APK yalnızca CI'da derlenir.
