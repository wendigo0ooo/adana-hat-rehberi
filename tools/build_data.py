#!/usr/bin/env python3
"""Adana Hat Rehberi - GTFS + resmi metro API verisinden uygulama verisi üretir."""

import csv
import json
import math
import os
import sys
import datetime
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data-src")
GTFS = os.path.join(SRC, "gtfs")
OUT = os.path.join(ROOT, "www", "data")
OUT_META = os.path.join(ROOT, "build", "data")

FEED_VALID_FROM = "2026-10-01"
FEED_VALID_UNTIL = "2026-11-30"
FEED_URL = "https://github.com/Egezenn/kk-gtfs"
API_URL = "https://ulasimbilgi.adana.bel.tr/"

OPERATOR_BY_AGENCY = {
    "1": "Büyükşehir / ÖHO",
    "14": "14 Nolu Meydan",
    "15": "15 Nolu Barkal",
    "18": "18 Nolu Topel",
    "19": "19 Nolu İncirlik",
    "22": "22 Nolu Özbirlik",
    "24": "24 Nolu Yavuzlar",
    "26": "26 Nolu İtimat",
    "29": "29 Nolu Denizli",
    "30": "30 Nolu Kiremithane",
    "48": "48 Nolu Akkapı",
    "72": "72 Nolu Kooperatif",
    "118": "118 Nolu Kooperatif",
    "178": "178 Nolu Kooperatif",
}

FARES = [
    {
        "mode": "otobus",
        "label": "Belediye otobüsü",
        "card": 39,
        "student": 20,
        "cash": 40,
        "validFrom": "2026-04",
        "source": "Toros / Objektif (Nisan 2026)",
    },
    {
        "mode": "oho",
        "label": "Özel halk otobüsü",
        "card": 49,
        "student": 33,
        "cash": None,
        "validFrom": "2026-10-12",
        "source": "İHA / Ekonomim (Ekim 2026)",
    },
    {
        "mode": "dolmus",
        "label": "Dolmuş / minibüs",
        "card": 50,
        "student": 33,
        "cash": 70,
        "validFrom": "2026-10-12",
        "source": "İHA / Ekonomim (Ekim 2026)",
    },
    {
        "mode": "metro",
        "label": "M1 Metro",
        "card": 39,
        "student": 20,
        "cash": 40,
        "validFrom": "2026-04",
        "source": "Toros / Objektif (Nisan 2026)",
    },
]


def rows(name):
    path = os.path.join(GTFS, name)
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)


def minutes(value):
    h, m = value.split(":")[:2]
    return int(h) * 60 + int(m)


def hhmm(total):
    if total < 0:
        total = 0
    return "%02d:%02d" % (total // 60, total % 60)


def haversine(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def simplify(points, tolerance=0.00012):
    if len(points) <= 2:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best_i, best_d = -1, -1.0
        for i in range(start + 1, end):
            px, py = points[i]
            if norm == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > best_d:
                best_i, best_d = i, dist
        if best_d > tolerance:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [p for p, k in zip(points, keep) if k]


def load_calendar():
    services = {}
    starts = []
    ends = []
    for row in rows("calendar.txt"):
        starts.append(row["start_date"])
        ends.append(row["end_date"])
        weekday = all(row[day] == "1" for day in ("monday", "tuesday", "wednesday", "thursday", "friday"))
        if row["saturday"] == "1" and not weekday:
            key = "sa"
        elif row["sunday"] == "1" and not weekday:
            key = "su"
        else:
            key = "wd"
        services[row["service_id"]] = key

    def fmt(value):
        return "%s-%s-%s" % (value[:4], value[4:6], value[6:8])

    valid_from = fmt(min(starts)) if starts else FEED_VALID_FROM
    valid_until = fmt(max(ends)) if ends else FEED_VALID_UNTIL
    return services, valid_from, valid_until


def mode_for(code):
    return "minibus" if len(code) == 5 else "bus"


def load():
    routes = {r["route_id"]: r for r in rows("routes.txt")}
    stops = {s["stop_id"]: s for s in rows("stops.txt")}
    trips = list(rows("trips.txt"))
    shapes = defaultdict(list)
    for s in rows("shapes.txt"):
        try:
            point = (int(s["shape_pt_sequence"]), float(s["shape_pt_lat"]), float(s["shape_pt_lon"]))
        except (TypeError, ValueError):
            continue
        shapes[s["shape_id"]].append(point)

    active = {t["route_id"] for t in trips}
    groups = defaultdict(list)
    for t in trips:
        groups[(t["route_id"], t["direction_id"])].append(t)

    stop_times = defaultdict(list)
    with open(os.path.join(GTFS, "stop_times.txt"), encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            stop_times[r["trip_id"]].append(
                (int(r["stop_sequence"]), r["stop_id"], minutes(r["arrival_time"]), minutes(r["departure_time"]))
            )
    for value in stop_times.values():
        value.sort()

    return routes, stops, groups, shapes, stop_times, active


def build_routes():
    routes, stops, groups, shapes, stop_times, active = load()
    services, _, _ = load_calendar()
    out = []
    used_stops = set()

    for route_id in sorted(active, key=lambda r: (len(routes[r]["route_short_name"]), routes[r]["route_short_name"])):
        info = routes[route_id]
        code = info["route_short_name"]
        agency = info["agency_id"]
        mode = mode_for(code)
        directions = []

        for (rid, direction) in sorted(groups):
            if rid != route_id:
                continue
            trip_list = groups[(rid, direction)]
            trips_by_shape = Counter(t["shape_id"] for t in trip_list)

            first_stops = Counter()
            for t in trip_list:
                seq = stop_times.get(t["trip_id"])
                if seq:
                    first_stops[seq[0][1]] += 1
            first_stop = first_stops.most_common(1)[0][0]

            candidates = [t for t in trip_list if stop_times.get(t["trip_id"], [(0, None)])[0][1] == first_stop]
            rep = candidates[0] if candidates else trip_list[0]
            seq = stop_times[rep["trip_id"]]
            base = seq[0][3]
            offsets = [max(0, arr - base) for _, _, arr, _ in seq]
            path_stops = [sid for _, sid, _, _ in seq]
            used_stops.update(path_stops)

            shape_id = trips_by_shape.most_common(1)[0][0]
            raw = [(lat, lon) for _, lat, lon in sorted(shapes.get(shape_id, []))]
            shape = simplify(raw)
            shape = [[round(lat, 5), round(lon, 5)] for lat, lon in shape]

            distance = 0.0
            for a, b in zip(raw, raw[1:]):
                distance += haversine(a, b)

            departures = {"wd": [], "sa": [], "su": []}
            for t in candidates:
                key = services.get(t["service_id"])
                if key:
                    departures[key].append(hhmm(stop_times[t["trip_id"]][0][3]))
            for key in departures:
                departures[key].sort()

            headsigns = Counter(t["trip_headsign"] for t in trip_list)
            directions.append(
                {
                    "d": int(direction),
                    "heads": headsigns.most_common(1)[0][0],
                    "stops": path_stops,
                    "offsets": offsets,
                    "shape": shape,
                    "km": round(distance / 1000, 1),
                    "dep": departures,
                    "dataLevel": "full",
                }
            )

        if not directions:
            continue

        operator = OPERATOR_BY_AGENCY.get(agency, "Adana BB - Otobüs")
        if mode == "minibus" and agency == "1":
            operator = "Diğer dolmuş kooperatifi"
        out.append(
            {
                "id": route_id,
                "code": code,
                "name": info["route_long_name"].strip(),
                "agency": agency,
                "operator": operator,
                "mode": mode,
                "dirs": directions,
            }
        )

    stop_data = {}
    for sid in used_stops:
        s = stops[sid]
        stop_data[sid] = [s["stop_name"].strip(), round(float(s["stop_lat"]), 5), round(float(s["stop_lon"]), 5), 0]

    return out, stop_data


def official_detail(bus_id):
    path = os.path.join(SRC, "official_routes", "%s.json" % bus_id)
    if not os.path.exists(path):
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return None


def valid_hhmm(value):
    parts = str(value or "").split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return False
    hour, minute = int(parts[0]), int(parts[1])
    return 0 <= hour < 24 and 0 <= minute < 60


def official_stop_path(detail, stop_data):
    rows = detail.get("stops_bus") or []
    try:
        rows = sorted(rows, key=lambda item: int(item.get("SeqNo", 0)))
    except (TypeError, ValueError):
        pass
    path = []
    for row in rows:
        try:
            sid = str(row["Id"])
            name = str(row.get("Name") or "Durak").strip()
            lat = round(float(row["Lat"]), 5)
            lon = round(float(row["Lon"]), 5)
        except (KeyError, TypeError, ValueError):
            continue
        path.append(sid)
        if sid not in stop_data:
            stop_data[sid] = [name, lat, lon, 0]
    return path


def official_shape(detail):
    points = detail.get("point_bus") or []
    try:
        points = sorted(points, key=lambda item: int(item.get("SeqNo", 0)))
    except (TypeError, ValueError):
        pass
    raw = []
    for point in points:
        try:
            raw.append((float(point["Lat"]), float(point["Lon"])))
        except (KeyError, TypeError, ValueError):
            continue
    shape = simplify(raw)
    shape = [[round(lat, 5), round(lon, 5)] for lat, lon in shape]
    distance = sum(haversine(a, b) for a, b in zip(raw, raw[1:]))
    return shape, (round(distance / 1000, 1) if raw else None)


def official_departures(detail, first_stop):
    out = {"wd": [], "sa": [], "su": []}
    schedules = detail.get("stopTimes") or {}
    for day, key in (("weekday", "wd"), ("saturday", "sa"), ("sunday", "su")):
        times = set()
        for record in schedules.get(day) or []:
            if first_stop is not None and str(record.get("StopId")) != str(first_stop):
                continue
            value = str(record.get("PassTime") or "").strip()
            if valid_hhmm(value):
                times.add(value)
        out[key] = sorted(times)
    return out


def synthesize_offsets(path, stop_data, speed_kmh=18.0):
    """Resmî API'de varış süresi yok; durak koordinatlarından yaklaşık süre üretir."""
    if not path:
        return []
    offsets = [0]
    total_km = 0.0
    prev = stop_data.get(path[0])
    for sid in path[1:]:
        current = stop_data.get(sid)
        if prev and current:
            total_km += haversine((prev[1], prev[2]), (current[1], current[2])) / 1000.0
        offsets.append(int(round(total_km / speed_kmh * 60)))
        prev = current or prev
    # monotonik ve en az 1 dk/durak (çok kısa aralıklarda 0 birikmesin)
    for i in range(1, len(offsets)):
        if offsets[i] <= offsets[i - 1]:
            offsets[i] = offsets[i - 1] + 1
    return offsets


def add_official_limited(routes, stop_data):
    buses_path = os.path.join(SRC, "buses.json")
    stops_path = os.path.join(SRC, "official_stops.json")
    if not (os.path.exists(buses_path) and os.path.exists(stops_path)):
        return 0
    official = json.load(open(buses_path, encoding="utf-8"))
    names = {}
    for s in json.load(open(stops_path, encoding="utf-8")):
        names[str(s["Id"])] = s["Name"]

    existing = {r["code"] for r in routes}
    grouped = defaultdict(list)
    for rec in official:
        if rec.get("Active") != "1":
            continue
        grouped[rec["DisplayRouteCode"]].append(rec)

    added = 0
    enriched = 0
    for code, recs in grouped.items():
        if code in existing:
            continue
        recs = sorted(recs, key=lambda x: (x["Direction"], x["FirstStopId"]))
        seen = set()
        dirs = []
        for rec in recs:
            if rec["Direction"] in seen:
                continue
            seen.add(rec["Direction"])
            detail = official_detail(rec["Id"])
            path, shape, km, dep = [], [], None, {"wd": [], "sa": [], "su": []}
            if detail:
                path = official_stop_path(detail, stop_data)
                shape, km = official_shape(detail)
                dep = official_departures(detail, path[0] if path else None)
                if path:
                    enriched += 1
            start = names.get(str(rec["FirstStopId"]), "Başlangıç")
            end = names.get(str(rec["LastStopId"]), "Bitiş")
            if path and path[0] in stop_data:
                start = stop_data[path[0]][0]
            if path and path[-1] in stop_data:
                end = stop_data[path[-1]][0]
            level = "none"
            if path:
                level = "approx" if any(dep.values()) else "stops-only"
            offsets = synthesize_offsets(path, stop_data) if path else []
            dirs.append(
                {
                    "d": int(rec["Direction"]),
                    "heads": "%s → %s" % (start, end),
                    "stops": path,
                    "offsets": offsets,
                    "shape": shape,
                    "km": km,
                    "dep": dep,
                    "dataLevel": level,
                }
            )
        name = Counter(r["Name"] for r in recs).most_common(1)[0][0]
        has_detail = any(d["dataLevel"] != "none" for d in dirs)
        partial = has_detail and any(d["dataLevel"] != "full" for d in dirs)
        routes.append(
            {
                "id": "official-%s" % code,
                "code": code,
                "name": name.strip(),
                "agency": "official",
                "operator": "Büyükşehir / ÖHO",
                "mode": "bus",
                "limited": not has_detail,
                "partial": partial,
                "dirs": dirs,
            }
        )
        added += 1
    print("official limited:", added, "hat,", enriched, "zenginleştirilmiş yön")
    return added

def build_metro(stop_data):
    stations = json.load(open(os.path.join(SRC, "metro_raw.json"), encoding="utf-8"))
    stations.sort(key=lambda s: int(s["SeqNo"]))

    schedules = {}
    mins = defaultdict(dict)
    for idx in range(1000001, 1000014):
        path = os.path.join(SRC, "metro_%d.json" % idx)
        if not os.path.exists(path):
            continue
        data = json.load(open(path, encoding="utf-8"))
        schedules[idx] = data
        for day in ("weekday", "saturday", "sunday"):
            for rec in data.get(day, []):
                sid = int(rec["StopId"])
                dire = int(rec["Direction"])
                cur = mins[(day, dire)].get(sid)
                if cur is None or rec["PassTime"] < cur:
                    mins[(day, dire)][sid] = rec["PassTime"]

    by_seq = {int(s["SeqNo"]): s for s in stations}
    station_objs = []
    for s in stations:
        sid = "M%s" % s["Id"]
        stop_data[sid] = [s["Name"].replace(" İSTASYONU", "").strip().title(), round(float(s["Lat"]), 5),
                          round(float(s["Lon"]), 5), 1]
        station_objs.append({"id": sid, "name": s["Name"].replace(" İSTASYONU", "").strip().title(),
                             "seq": int(s["SeqNo"])})

    directions = []
    for direction, first_seq, last_seq, label in ((0, 1, 13, "Hastane → Akıncılar"),
                                                   (1, 13, 1, "Akıncılar → Hastane")):
        seqs = list(range(first_seq, last_seq + (1 if last_seq > first_seq else -1),
                          1 if last_seq > first_seq else -1))
        origin = by_seq[first_seq]["Id"]
        origin_min = mins[("weekday", direction)].get(origin)
        offsets = []
        last = 0
        for seq in seqs:
            val = mins[("weekday", direction)].get(by_seq[seq]["Id"])
            if val is None or origin_min is None:
                last = last + 2
                offsets.append(last)
            else:
                last = minutes(val) - minutes(origin_min)
                offsets.append(last)
        lo = min(offsets)
        offsets = [o - lo for o in offsets]

        dep = {"wd": [], "sa": [], "su": []}
        terminal = by_seq[first_seq]["Id"]
        for day, key in (("weekday", "wd"), ("saturday", "sa"), ("sunday", "su")):
            times = sorted(r["PassTime"] for r in schedules.get(terminal, {}).get(day, [])
                           if int(r["Direction"]) == direction)
            dep[key] = times

        directions.append(
            {
                "d": direction,
                "heads": label,
                "stops": ["M%s" % by_seq[seq]["Id"] for seq in seqs],
                "offsets": offsets,
                "shape": [[round(float(by_seq[seq]["Lat"]), 5), round(float(by_seq[seq]["Lon"]), 5)] for seq in seqs],
                "km": 13.5,
                "dep": dep,
                "dataLevel": "full",
            }
        )

    route = {
        "id": "metro-m1",
        "code": "M1",
        "name": "Adana Metrosu (Hastane – Akıncılar)",
        "agency": "metro",
        "operator": "Adana Ulaşım A.Ş.",
        "mode": "metro",
        "dirs": directions,
    }
    return route, station_objs


def load_announcements():
    path = os.path.join(SRC, "announcements.json")
    if not os.path.exists(path):
        return []
    try:
        raw = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return []
    today = datetime.date.today().isoformat()
    active = []
    for item in raw:
        end = item.get("end") or ""
        if end and end < today:
            continue
        active.append(item)
    return active


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(OUT_META, exist_ok=True)
    routes, stop_data = build_routes()
    _, feed_from, feed_until = load_calendar()
    announcements = load_announcements()
    metro, stations = build_metro(stop_data)
    routes.append(metro)
    limited = add_official_limited(routes, stop_data)
    routes.sort(key=lambda r: (r["mode"] == "metro", len(r["code"]), r["code"]))

    stops_count = len(stop_data)
    dir_count = sum(len(r["dirs"]) for r in routes)
    meta = {
        "app": "Adana Hat Rehberi",
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "feed": {
            "name": "KentKart türevi community GTFS (Egezenn/kk-gtfs)",
            "validFrom": feed_from,
            "validUntil": feed_until,
            "license": "CC0 1.0 (derleme); kaynak veri KentKart/Adana BB",
            "url": FEED_URL,
        },
        "official": {"name": "Adana Ulaşım", "url": API_URL},
        "counts": {
            "routes": len(routes),
            "bus": sum(1 for r in routes if r["mode"] == "bus"),
            "minibus": sum(1 for r in routes if r["mode"] == "minibus"),
            "metro": sum(1 for r in routes if r["mode"] == "metro"),
            "limited": sum(1 for r in routes if r.get("limited")),
            "partial": sum(1 for r in routes if r.get("partial")),
            "announcements": len(announcements),
            "stops": stops_count,
            "directions": dir_count,
            "metros": len(stations),
        },
        "fares": FARES,
        "faresValidFrom": "2026-10",
        "sources": [
            "KentKart türevi community GTFS (Egezenn/kk-gtfs) - CC0 derleme",
            "Adana Ulaşım resmî web API'si (metro istasyon/sefer, sınırlı hat durak/şekil ve kalkış bilgisi)",
            "OpenStreetMap katkıcıları - harita döşemeleri (ODbL)",
        ],
        "limitedNote": "Sınırlı hatlarda hiçbir durak/sefer verisi yayımlanmamıştır. "
                       "Kısmi verili hatlarda durak listesi ve güzergah resmî API'den alınır; "
                       "sefer saatleri yalnızca kalkış durağı için, varış süreleri ise mesafeden "
                       "yaklaşık hesaplanır.",
        "disclaimer": "Bu uygulama resmî değildir. Veriler KentKart türevi GTFS ve Adana Ulaşım "
                      "kaynaklarından derlenmiştir; sefer saatleri ve ücretler değişebilir. "
                      "Yolculuk öncesi güncel bilgiyi resmî kanallardan doğrulayın.",
    }

    with open(os.path.join(OUT_META, "routes.json"), "w", encoding="utf-8") as fh:
        json.dump(routes, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_META, "stops.json"), "w", encoding="utf-8") as fh:
        json.dump(stop_data, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_META, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    network = {"meta": meta, "routes": routes, "stops": stop_data, "announcements": announcements}
    with open(os.path.join(OUT, "network.js"), "w", encoding="utf-8") as fh:
        fh.write("window.ADANA_DATA=")
        json.dump(network, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    print("routes:", len(routes), "dirs:", dir_count, "stops:", stops_count, "announcements:", len(announcements))
    for name in ("routes.json", "stops.json", "meta.json"):
        size = os.path.getsize(os.path.join(OUT_META, name))
        print(name, "%.1f KB" % (size / 1024))
    size = os.path.getsize(os.path.join(OUT, "network.js"))
    print("network.js", "%.1f KB" % (size / 1024))


if __name__ == "__main__":
    sys.exit(main())
