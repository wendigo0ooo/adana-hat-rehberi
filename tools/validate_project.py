#!/usr/bin/env python3
"""Proje ve veri bütünlüğünü doğrular (Android SDK gerektirmez)."""

import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []
warnings = []


def check(condition, message):
    if not condition:
        errors.append(message)


def warn(condition, message):
    if not condition:
        warnings.append(message)


def load_network():
    path = os.path.join(ROOT, "www", "data", "network.js")
    check(os.path.exists(path), "www/data/network.js yok; tools/build_data.py çalıştırılmalı")
    if not os.path.exists(path):
        return None
    raw = open(path, encoding="utf-8").read().strip()
    prefix = "window.ADANA_DATA="
    check(raw.startswith(prefix), "network.js beklenen önekle başlamıyor")
    check(raw.endswith(";"), "network.js noktalı virgülle bitmiyor")
    try:
        return json.loads(raw[len(prefix):].rstrip(";"))
    except json.JSONDecodeError as exc:
        errors.append("network.js JSON olarak çözülemedi: %s" % exc)
        return None


def valid_time(value):
    return bool(re.match(r"^([01]\d|2[0-8]):[0-5]\d$", value))


def validate_data(data):
    meta = data.get("meta", {})
    routes = data.get("routes", [])
    stops = data.get("stops", {})
    counts = meta.get("counts", {})

    check(len(routes) == counts.get("routes"), "meta.routes sayısı eşleşmiyor")
    check(len(stops) == counts.get("stops"), "meta.stops sayısı eşleşmiyor")
    check(counts.get("metro") == 1, "tam olarak bir metro hattı bekleniyor")

    ids = [r["id"] for r in routes]
    codes = [r["code"] for r in routes]
    check(len(ids) == len(set(ids)), "yinelenen route id var")
    check(len(codes) == len(set(codes)), "yinelenen hat kodu var")

    full_dirs = 0
    for route in routes:
        check(route["mode"] in ("bus", "minibus", "metro"), "geçersiz mod: %s" % route.get("mode"))
        check(bool(route["dirs"]), "%s için yön yok" % route["code"])
        for direction in route["dirs"]:
            check(direction["d"] in (0, 1), "%s geçersiz yön" % route["code"])
            path = direction["stops"]
            offsets = direction["offsets"]
            check(len(path) == len(offsets), "%s yön %s: durak/süre uzunluğu farklı" %
                  (route["code"], direction["d"]))
            level = direction.get("dataLevel", "full")
            check(level in ("full", "approx", "stops-only", "none"),
                  "%s yön %s: geçersiz dataLevel %r" % (route["code"], direction["d"], level))
            if route.get("limited"):
                check(not path, "%s sınırlı hat durak içermemeli" % route["code"])
                continue
            if level == "none":
                check(not path, "%s yön %s: dataLevel none ama durak var" % (route["code"], direction["d"]))
                continue
            if level == "full":
                full_dirs += 1
            check(len(path) >= 2, "%s yön %s: en az 2 durak gerekli" % (route["code"], direction["d"]))
            if level in ("full", "approx"):
                check(len(direction["shape"]) >= 2, "%s yön %s: şekil eksik" % (route["code"], direction["d"]))
            for sid in path:
                check(sid in stops, "%s bilinmeyen durak kullanıyor: %s" % (route["code"], sid))
            for lat, lon in direction["shape"]:
                check(35.0 <= lat <= 38.5 and 34.5 <= lon <= 37.0,
                      "%s şekil koordinatı Türkiye/Adana dışında: %s,%s" % (route["code"], lat, lon))
            for key in ("wd", "sa", "su"):
                times = direction["dep"][key]
                check(times == sorted(times), "%s yön %s %s saatleri sıralı değil" %
                      (route["code"], direction["d"], key))
                for value in times:
                    check(valid_time(value), "%s geçersiz saat: %s" % (route["code"], value))

    check(full_dirs >= 200, "tam güzergah sayısı beklenenden az: %d" % full_dirs)

    for sid, stop in stops.items():
        check(isinstance(stop, list) and len(stop) == 4, "durak kaydı bozuk: %s" % sid)
        check(35.0 <= stop[1] <= 38.5 and 34.5 <= stop[2] <= 37.0, "durak koordinatı şüpheli: %s" % sid)
        check(stop[3] in (0, 1), "durak türü geçersiz: %s" % sid)

    metro = [r for r in routes if r["mode"] == "metro"][0]
    check(len(metro["dirs"]) == 2, "metro iki yönlü olmalı")
    check(len(metro["dirs"][0]["stops"]) == 13, "metro 13 istasyon bekleniyor")
    check(len(metro["dirs"][0]["dep"]["wd"]) >= 70, "metro hafta içi sefer sayısı düşük")

    check(any(r["code"] == "114" and not r.get("limited") for r in routes), "114 hattı eksik")
    check(any(r["mode"] == "minibus" for r in routes), "dolmuş hattı yok")
    check((meta.get("feed", {}).get("validUntil") or "") != "", "feed geçerlilik tarihi yok")
    valid_until = meta.get("feed", {}).get("validUntil") or ""
    if valid_until:
        try:
            end = datetime.date.fromisoformat(valid_until)
            today = datetime.date.today()
            if end < today:
                errors.append("GTFS geçerlilik tarihi geçmiş: %s" % valid_until)
            elif (end - today).days <= 14:
                warnings.append("GTFS geçerliliği %d gün içinde bitiyor: %s" % ((end - today).days, valid_until))
        except ValueError:
            errors.append("feed.validUntil geçersiz tarih: %s" % valid_until)


def validate_files():
    required = [
        "www/index.html",
        "www/css/style.css",
        "www/js/data.js",
        "www/js/ui.js",
        "www/js/map.js",
        "www/js/app.js",
        "www/manifest.json",
        "www/sw.js",
        "www/vendor/leaflet/leaflet.js",
        "www/vendor/leaflet/leaflet.css",
        "www/icons/icon-192.png",
        "www/icons/icon-512.png",
        "android/settings.gradle.kts",
        "android/build.gradle.kts",
        "android/app/build.gradle.kts",
        "android/app/src/main/AndroidManifest.xml",
        "android/app/src/main/java/com/wendigo/adanahat/MainActivity.kt",
        "android/app/src/main/res/values/strings.xml",
        ".github/workflows/build.yml",
    ]
    for relative in required:
        check(os.path.exists(os.path.join(ROOT, relative)), "eksik dosya: %s" % relative)

    manifest_path = os.path.join(ROOT, "android/app/src/main/AndroidManifest.xml")
    if os.path.exists(manifest_path):
        manifest = open(manifest_path, encoding="utf-8").read()
        check("android.permission.INTERNET" in manifest, "INTERNET izni yok")
        check("android.permission.ACCESS_FINE_LOCATION" in manifest, "konum izni yok")
        check(".MainActivity" in manifest, "MainActivity manifestte yok")
        check("@mipmap/ic_launcher" in manifest, "uygulama ikonu bağlı değil")

    gradle_path = os.path.join(ROOT, "android/app/build.gradle.kts")
    if os.path.exists(gradle_path):
        gradle = open(gradle_path, encoding="utf-8").read()
        check('assets.srcDirs("../../www")' in gradle, "assets kaynağı www klasörüne bağlı değil")
        check("minSdk = 24" in gradle, "minSdk 24 bekleniyor")
        check("compileSdk = 34" in gradle, "compileSdk 34 bekleniyor")
        resolved = os.path.normpath(os.path.join(ROOT, "android/app", "../../www"))
        check(os.path.exists(os.path.join(resolved, "index.html")), "assets yolu index.html'e ulaşmıyor")

    activity_path = os.path.join(ROOT, "android/app/src/main/java/com/wendigo/adanahat/MainActivity.kt")
    if os.path.exists(activity_path):
        activity = open(activity_path, encoding="utf-8").read()
        check('addJavascriptInterface(Bridge(), "AndroidBridge")' in activity, "konum köprüsü yok")
        check('file:///android_asset/index.html' in activity, "WebView yerel sayfayı yüklemiyor")
        check("canGoBack()" in activity, "geri tuşu yönetilmiyor")

    app_path = os.path.join(ROOT, "www/js/app.js")
    if os.path.exists(app_path):
        app = open(app_path, encoding="utf-8").read()
        check("AndroidBridge" in app, "JS tarafında Android köprüsü kullanılmıyor")
        check("map.js" in open(os.path.join(ROOT, "www/index.html"), encoding="utf-8").read(),
              "index.html map.js yüklemiyor")
        check("ADANA_DATA" in app, "uygulama gömülü veriyi okumuyor")

    workflow = os.path.join(ROOT, ".github/workflows/build.yml")
    if os.path.exists(workflow):
        text = open(workflow, encoding="utf-8").read()
        check("assembleDebug" in text and "assembleRelease" in text, "CI iki APK türünü de derlemiyor")
        check("gradle-version: '8.7'" in text, "CI Gradle 8.7 kullanmıyor")
        check("java-version: '17'" in text, "CI JDK 17 kullanmıyor")


def main():
    data = load_network()
    if data:
        validate_data(data)
    validate_files()

    print("— doğrulama —")
    if warnings:
        for message in warnings:
            print("UYARI:", message)
    if errors:
        for message in errors:
            print("HATA:", message)
        print("%d hata bulundu." % len(errors))
        return 1
    counts = data["meta"]["counts"]
    print("OK · %d hat · %d durak · %d yön · metro %d istasyon" %
          (counts["routes"], counts["stops"], counts["directions"], counts["metros"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
