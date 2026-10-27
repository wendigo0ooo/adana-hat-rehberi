#!/usr/bin/env python3
"""Ham veri kaynaklarını indirir: GTFS, ABB hat/durak/metro listeleri.

Kullanım:
    python3 tools/fetch_sources.py

Çıktılar (data-src/, git'e dahil değil):
    adana.zip, gtfs/, buses.json, official_stops.json, metro_raw.json
"""

import json
import os
import shutil
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data-src")
GTFS = os.path.join(SRC, "gtfs")
ENTRY = "https://github.com/Egezenn/kk-gtfs/raw/main/data/adana.zip"
API = "https://ulasimbilgi.adana.bel.tr"
UA = "AdanaHatRehberi/1.0 (+https://github.com/wendigo0ooo/adana-hat-rehberi)"


def request(url, method="GET", body=None):
    headers = {"Accept": "application/json", "User-Agent": UA}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def fetch_gtfs():
    os.makedirs(SRC, exist_ok=True)
    archive = os.path.join(SRC, "adana.zip")
    raw = request(ENTRY)
    with open(archive, "wb") as fh:
        fh.write(raw)
    if os.path.isdir(GTFS):
        shutil.rmtree(GTFS)
    os.makedirs(GTFS)
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(GTFS)
    print("GTFS:", len(os.listdir(GTFS)), "dosya")


def write_json(name, payload):
    path = os.path.join(SRC, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(name, "->", path)


def main():
    os.makedirs(SRC, exist_ok=True)
    fetch_gtfs()
    write_json("buses.json", json.loads(request(API + "/api/buses", "POST", b"{}")))
    write_json("official_stops.json", json.loads(request(API + "/api/stops")))
    write_json("metro_raw.json", json.loads(request(API + "/api/metro")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
