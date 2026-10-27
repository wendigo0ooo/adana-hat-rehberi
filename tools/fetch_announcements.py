#!/usr/bin/env python3
"""ABB duyurularını çeker ve data-src/announcements.json olarak normalize eder."""

import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data-src")
API = "https://ulasimbilgi.adana.bel.tr"
OUT = os.path.join(SRC, "announcements.json")


def post(path):
    data = b"{}"
    request = urllib.request.Request(
        API + path,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "AdanaHatRehberi/1.0 (+https://github.com/wendigo0ooo/adana-hat-rehberi)",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_buses():
    path = os.path.join(SRC, "buses.json")
    if not os.path.exists(path):
        return {}
    buses = json.load(open(path, encoding="utf-8"))
    return {str(bus.get("Id")): str(bus.get("DisplayRouteCode")) for bus in buses if bus.get("Active") == "1"}


def clean(value):
    return " ".join(str(value or "").split())


def main():
    id_to_code = load_buses()
    payload = post("/api/announcements")
    rows = payload.get("attention") or []
    out = []
    for row in rows:
        if str(row.get("IsDeleted")) != "0":
            continue
        code = id_to_code.get(str(row.get("BusId")))
        out.append(
            {
                "id": row.get("Id"),
                "title": clean(row.get("Title")),
                "text": clean(row.get("Description"))[:900],
                "routes": [code] if code else [],
                "start": (row.get("StartTime") or "")[:10],
                "end": (row.get("FinishTime") or "")[:10],
                "all": str(row.get("IsAll")) == "1",
            }
        )
    out.sort(key=lambda item: (item.get("start") or "", item.get("id") or 0), reverse=True)
    os.makedirs(SRC, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("duyuru:", len(out), "->", OUT)


if __name__ == "__main__":
    main()
