#!/usr/bin/env python3
"""Resmî Adana Ulaşım API'sinden sınırlı hatların durak/şekil verisini indirir.

GTFS'te seferi olmayan ama resmî listede aktif olan hatlar için
`/api/buses/{id}` uç noktasından durak listesi, güzergah şekli ve varsa
kalkış saatleri alınır. Sonuçlar `data-src/official_routes/` altına yazılır;
`tools/build_data.py` bu dosyaları otomatik olarak kullanır.
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data-src")
GTFS = os.path.join(SRC, "gtfs")
OUT = os.path.join(SRC, "official_routes")
API = "https://ulasimbilgi.adana.bel.tr"
HEADERS = {
    "User-Agent": "AdanaHatRehberi/1.0 (+https://github.com/wendigo0ooo)",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Referer": API + "/Otobusler",
}


def request(path, method="GET", retries=3):
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(API + path, data=b"" if method == "POST" else None,
                                     headers=HEADERS, method=method)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise last


def gtfs_codes():
    active = set()
    with open(os.path.join(GTFS, "trips.txt"), encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            active.add(row["route_id"])
    codes = set()
    with open(os.path.join(GTFS, "routes.txt"), encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["route_id"] in active:
                codes.add(row["route_short_name"])
    return codes


def official_routes():
    path = os.path.join(SRC, "buses.json")
    if not os.path.exists(path):
        sys.exit("data-src/buses.json yok; önce resmî hat listesini indirin.")
    records = json.load(open(path, encoding="utf-8"))
    return [rec for rec in records if rec.get("Active") == "1"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Önbelleği yok say ve yeniden indir")
    parser.add_argument("--delay", type=float, default=0.15, help="Parti sonu bekleme (sn)")
    parser.add_argument("--workers", type=int, default=4, help="Eşzamanlı istek sayısı")
    args = parser.parse_args()

    os.makedirs(OUT, exist_ok=True)
    known = gtfs_codes()
    targets = {}
    for rec in official_routes():
        code = rec.get("DisplayRouteCode")
        if not code or code in known:
            continue
        targets.setdefault((str(rec["Id"]), int(rec.get("Direction", 0))), rec)

    pending = []
    skipped = 0
    for (bus_id, _direction), rec in sorted(targets.items()):
        path = os.path.join(OUT, "%s.json" % bus_id)
        if os.path.exists(path) and not args.force:
            skipped += 1
            continue
        pending.append((bus_id, rec))

    print("indirilecek yön:", len(pending), "· önbellek:", skipped, flush=True)

    def fetch(item):
        bus_id, rec = item
        detail = request("/api/buses/%s" % bus_id, method="POST")
        detail["_fetchedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        with open(os.path.join(OUT, "%s.json" % bus_id), "w", encoding="utf-8") as fh:
            json.dump(detail, fh, ensure_ascii=False, separators=(",", ":"))
        return bus_id, rec

    downloaded = failed = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(fetch, item): item for item in pending}
        for index, future in enumerate(as_completed(futures), 1):
            bus_id, rec = futures[future]
            try:
                future.result()
                downloaded += 1
            except Exception as exc:  # noqa: BLE001 - CLI raporu
                failed += 1
                print("HATA %s (%s): %s" % (bus_id, rec.get("DisplayRouteCode"), exc), flush=True)
            if index % 10 == 0 or index == len(futures):
                print("%d/%d işlendi" % (index, len(futures)), flush=True)
        if args.delay:
            time.sleep(args.delay)

    print("bitti · yeni: %d · önbellek: %d · hata: %d" % (downloaded, skipped, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
