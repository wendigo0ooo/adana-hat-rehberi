(function (global) {
  "use strict";

  var TR = {
    "İ": "i", "I": "i", "ı": "i", "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g",
    "Ü": "u", "ü": "u", "Ö": "o", "ö": "o", "Ç": "c", "ç": "c",
    "Â": "a", "â": "a", "Î": "i", "î": "i", "Û": "u", "û": "u"
  };

  function norm(value) {
    return String(value == null ? "" : value)
      .replace(/[İIıŞşĞğÜüÖöÇçÂâÎîÛû]/g, function (c) { return TR[c] || c; })
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function haversine(aLat, aLon, bLat, bLon) {
    var rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad;
    var dLon = (bLon - aLon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.asin(Math.sqrt(h));
  }

  function minutesOf(hhmm) {
    var p = String(hhmm).split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function timeOf(min) {
    var m = Math.max(0, Math.floor(min));
    return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
  }

  function displayTime(value) {
    if (!value) return "";
    var m = minutesOf(value);
    if (m < 1440) return value;
    return timeOf(m % 1440) + "\u207a\u00b9";
  }

  function istanbulNow() {
    var now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  var NEIGHBOR_METERS = 150;
  var GRID_DEG = 0.002;

  function gridKey(lat, lon) {
    return Math.floor(lat / GRID_DEG) + ":" + Math.floor(lon / GRID_DEG);
  }

  function buildNeighbors(stops) {
    var grid = new Map();
    var id;
    for (id in stops) {
      var key = gridKey(stops[id][1], stops[id][2]);
      var bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(id);
    }
    var neighbors = new Map();
    for (id in stops) {
      var stop = stops[id];
      var cx = Math.floor(stop[1] / GRID_DEG);
      var cy = Math.floor(stop[2] / GRID_DEG);
      var found = [];
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var bucket2 = grid.get((cx + dx) + ":" + (cy + dy));
          if (!bucket2) continue;
          for (var i = 0; i < bucket2.length; i++) {
            var other = bucket2[i];
            if (other === id) continue;
            var os = stops[other];
            var dist = haversine(stop[1], stop[2], os[1], os[2]);
            if (dist <= NEIGHBOR_METERS) found.push({ id: other, dist: dist });
          }
        }
      }
      found.sort(function (a, b) { return a.dist - b.dist; });
      neighbors.set(id, found.slice(0, 8));
    }
    return neighbors;
  }

  var MODE_LABEL = { bus: "Otobüs", minibus: "Dolmuş", metro: "Metro" };
  var MODE_ORDER = { metro: 0, bus: 1, minibus: 2 };

  var Data = {
    meta: {},
    routes: [],
    stops: {},
    byId: new Map(),
    stopLines: new Map(),
    ready: false,

    load: function (raw) {
      this.meta = (raw && raw.meta) || {};
      this.routes = (raw && raw.routes) || [];
      this.stops = (raw && raw.stops) || {};
      this.announcements = (raw && raw.announcements) || [];
      this.byId = new Map();
      this.stopLines = new Map();
      this.nameGroups = new Map();
      var self = this;
      this.routes.forEach(function (route) {
        self.byId.set(route.id, route);
        route.dirs.forEach(function (dir, di) {
          dir.idx = new Map();
          dir.stops.forEach(function (sid, index) {
            if (!dir.idx.has(sid)) dir.idx.set(sid, index);
            var arr = self.stopLines.get(sid);
            if (!arr) { arr = []; self.stopLines.set(sid, arr); }
            arr.push({ route: route, dir: dir, di: di, index: index });
          });
        });
      });
      var sid;
      for (sid in this.stops) {
        var name = norm(this.stops[sid][0]);
        var group = this.nameGroups.get(name);
        if (!group) { group = []; this.nameGroups.set(name, group); }
        group.push(sid);
      }
      this.neighbors = buildNeighbors(this.stops);
      this.ready = true;
      return this;
    },

    stop: function (id) { return this.stops[id] || null; },
    stopName: function (id) { var s = this.stops[id]; return s ? s[0] : "Durak"; },
    route: function (id) { return this.byId.get(id) || null; },

    modeLabel: function (mode) { return MODE_LABEL[mode] || mode; },

    todayKey: function () {
      var day = istanbulNow().getDay();
      return day === 0 ? "su" : (day === 6 ? "sa" : "wd");
    },

    dayLabel: function (key) {
      return key === "sa" ? "Cumartesi" : (key === "su" ? "Pazar" : "Hafta içi");
    },

    departures: function (dir, key) {
      return (dir && dir.dep && dir.dep[key]) ? dir.dep[key] : [];
    },

    tripCount: function (route, key) {
      var self = this;
      return route.dirs.reduce(function (n, dir) { return n + self.departures(dir, key || "wd").length; }, 0);
    },

    popularity: function (route) {
      var total = 0;
      route.dirs.forEach(function (dir) {
        total += dir.dep.wd.length + dir.dep.sa.length + dir.dep.su.length;
      });
      return total;
    },

    stats: function (route, dir, dayKeyOverride) {
      var key = dayKeyOverride || this.todayKey();
      var dep = this.departures(dir, key);
      var wd = this.departures(dir, "wd");
      var hasService = dep.length > 0;
      var gaps = [];
      for (var i = 1; i < wd.length; i++) {
        var gap = minutesOf(wd[i]) - minutesOf(wd[i - 1]);
        if (gap > 0 && gap <= 120) gaps.push(gap);
      }
      return {
        dayKey: key,
        hasService: hasService,
        first: hasService ? dep[0] : null,
        last: hasService ? dep[dep.length - 1] : null,
        count: dep.length,
        weekdayCount: wd.length,
        headway: median(gaps),
        duration: dir.offsets.length ? dir.offsets[dir.offsets.length - 1] : null,
        km: dir.km
      };
    },

    arrivalAt: function (dir, index, firstDeparture) {
      if (!firstDeparture || !dir.offsets.length) return null;
      return displayTime(timeOf(minutesOf(firstDeparture) + (dir.offsets[index] || 0)));
    },

    searchRoutes: function (query, mode, limit) {
      var q = norm(query);
      var self = this;
      var list = [];
      this.routes.forEach(function (route) {
        if (mode && mode !== "all" && route.mode !== mode) return;
        var score = 99;
        if (!q) {
          score = 10;
        } else {
          var code = norm(route.code);
          var name = norm(route.name);
          var operator = norm(route.operator);
          if (code === q) score = 0;
          else if (code.indexOf(q) === 0) score = 1;
          else if (name.indexOf(q) === 0) score = 2;
          else if (name.indexOf(q) >= 0) score = 3;
          else if (operator.indexOf(q) >= 0 || norm(route.code + " " + route.name).indexOf(q) >= 0) score = 4;
          else return;
        }
        list.push({ route: route, score: score, pop: self.popularity(route) });
      });
      list.sort(function (a, b) {
        if (a.score !== b.score) return a.score - b.score;
        if (a.pop !== b.pop) return b.pop - a.pop;
        return String(a.route.code).length - String(b.route.code).length ||
          a.route.code.localeCompare(b.route.code, "tr", { numeric: true });
      });
      return list.slice(0, limit || 60).map(function (x) { return x.route; });
    },

    searchStops: function (query, limit) {
      var q = norm(query);
      if (!q) return [];
      var list = [];
      for (var id in this.stops) {
        var s = this.stops[id];
        var name = norm(s[0]);
        var score = -1;
        if (name === q) score = 0;
        else if (name.indexOf(q) === 0) score = 1;
        else if (name.indexOf(" " + q) >= 0) score = 2;
        else if (name.indexOf(q) >= 0) score = 3;
        if (score < 0) continue;
        var lines = this.stopLines.get(id) || [];
        var group = this.nameGroups.get(name) || [];
        list.push({ id: id, name: s[0], lat: s[1], lon: s[2], kind: s[3], score: score,
          lines: lines.length, same: group.length });
      }
      list.sort(function (a, b) {
        if (a.score !== b.score) return a.score - b.score;
        if (a.lines !== b.lines) return b.lines - a.lines;
        return a.name.localeCompare(b.name, "tr");
      });
      return list.slice(0, limit || 40);
    },

    nearbyStops: function (lat, lon, limit, radius) {
      var max = radius || 2500;
      var out = [];
      for (var id in this.stops) {
        var s = this.stops[id];
        var dist = haversine(lat, lon, s[1], s[2]);
        if (dist <= max) out.push({ id: id, name: s[0], lat: s[1], lon: s[2], kind: s[3], dist: dist });
      }
      out.sort(function (a, b) { return a.dist - b.dist; });
      return out.slice(0, limit || 12);
    },

    activeAnnouncements: function () {
      var now = istanbulNow();
      var today = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
      return this.announcements.filter(function (item) {
        return !item.end || item.end >= today;
      });
    },

    announcementsFor: function (code) {
      var wanted = String(code);
      return this.activeAnnouncements().filter(function (item) {
        return (item.routes || []).indexOf(wanted) >= 0;
      });
    },

    linesAt: function (stopId) {
      return (this.stopLines.get(stopId) || []).slice();
    },

    routesAt: function (stopId) {
      var groups = new Map();
      this.linesAt(stopId).forEach(function (line) {
        var group = groups.get(line.route.id);
        if (!group) { group = { route: line.route, dirs: [] }; groups.set(line.route.id, group); }
        group.dirs.push(line);
      });
      var out = Array.from(groups.values());
      out.sort(function (a, b) {
        return (MODE_ORDER[a.route.mode] || 9) - (MODE_ORDER[b.route.mode] || 9) ||
          String(a.route.code).localeCompare(String(b.route.code), "tr", { numeric: true });
      });
      return out;
    },

    waitEstimate: function (dir) {
      var wd = this.departures(dir, "wd");
      var gaps = [];
      for (var i = 1; i < wd.length; i++) {
        var gap = minutesOf(wd[i]) - minutesOf(wd[i - 1]);
        if (gap > 0 && gap <= 120) gaps.push(gap);
      }
      var h = median(gaps);
      return h ? Math.min(15, Math.round(h / 2)) : 8;
    },

    plan: function (fromId, toId) {
      if (!fromId || !toId || fromId === toId) return { direct: [], transfers: [] };
      var self = this;
      var direct = [];
      var seenDirect = new Set();
      var dests = [{ id: toId, dist: 0 }].concat((this.neighbors.get(toId) || []).slice(0, 4));
      function walkMins(dest) {
        return dest.dist > 0 ? Math.max(1, Math.round(dest.dist / 75)) : 0;
      }

      this.routes.forEach(function (route) {
        route.dirs.forEach(function (dir) {
          if (!dir.stops.length) return;
          var a = dir.idx.get(fromId);
          if (a == null) return;
          var best = null;
          dests.forEach(function (dest) {
            var b = dir.idx.get(dest.id);
            if (b == null || b <= a) return;
            var mins = (dir.offsets[b] || 0) - (dir.offsets[a] || 0) + walkMins(dest);
            if (!best || mins < best.mins) {
              best = { b: b, mins: mins, toStop: dest.id, toWalk: Math.round(dest.dist) };
            }
          });
          if (!best) return;
          var key = route.id + "|" + dir.d;
          if (seenDirect.has(key)) return;
          seenDirect.add(key);
          direct.push({
            route: route, dir: dir, fromIdx: a, toIdx: best.b, stops: best.b - a,
            mins: best.mins, wait: self.waitEstimate(dir),
            toStop: best.toStop, toWalk: best.toWalk
          });
        });
      });

      direct.sort(function (x, y) { return (x.mins - y.mins) || (x.stops - y.stops); });
      var bestDirect = [];
      var seenRoute = new Set();
      direct.forEach(function (item) {
        if (bestDirect.length >= 6) return;
        if (seenRoute.has(item.route.id)) return;
        seenRoute.add(item.route.id);
        bestDirect.push(item);
      });

      var transfers = [];
      var seen = new Set();
      var fromLines = this.stopLines.get(fromId) || [];
      fromLines.forEach(function (leg1) {
        var dir1 = leg1.dir;
        if (!dir1.stops.length) return;
        var limit = Math.min(dir1.stops.length - 1, leg1.index + 40);
        for (var k = leg1.index + 1; k < limit; k++) {
          var alight = dir1.stops[k];
          if (alight === toId) continue;
          var candidates = [{ id: alight, dist: 0 }].concat(self.neighbors.get(alight) || []);
          for (var c = 0; c < candidates.length; c++) {
            var board = candidates[c];
            var lines = self.stopLines.get(board.id) || [];
            for (var l = 0; l < lines.length; l++) {
              var leg2 = lines[l];
              if (leg2.route.id === leg1.route.id) continue;
              var best2 = null;
              dests.forEach(function (dest) {
                var b = leg2.dir.idx.get(dest.id);
                if (b == null || b <= leg2.index) return;
                var mins = (leg2.dir.offsets[b] - leg2.dir.offsets[leg2.index]) + walkMins(dest);
                if (!best2 || mins < best2.mins) {
                  best2 = { b: b, mins: mins, toStop: dest.id, toWalk: Math.round(dest.dist) };
                }
              });
              if (!best2) continue;
              var key = leg1.route.id + ">" + leg2.route.id + ">" + alight + ">" + board.id + ">" + best2.toStop;
              if (seen.has(key)) continue;
              seen.add(key);
              var transferWalkMins = board.dist > 0 ? Math.max(1, Math.round(board.dist / 75)) : 0;
              var mins = (dir1.offsets[k] - dir1.offsets[leg1.index]) +
                transferWalkMins + best2.mins +
                Math.min(15, self.waitEstimate(leg2.dir)) + 2;
              transfers.push({
                first: { route: leg1.route, dir: dir1, fromIdx: leg1.index, toIdx: k, stops: k - leg1.index },
                second: { route: leg2.route, dir: leg2.dir, fromIdx: leg2.index, toIdx: best2.b, stops: best2.b - leg2.index,
                  toStop: best2.toStop, toWalk: best2.toWalk },
                transfer: alight,
                board: board.id,
                walk: Math.round(board.dist),
                mins: mins
              });
            }
          }
        }
      });

      transfers.sort(function (x, y) { return (x.mins + x.first.stops * 0.3) - (y.mins + y.first.stops * 0.3); });
      var bestTransfers = [];
      var seenPair = new Set();
      transfers.forEach(function (item) {
        if (bestTransfers.length >= 6) return;
        var pair = item.first.route.id + "|" + item.second.route.id;
        if (seenPair.has(pair)) return;
        seenPair.add(pair);
        bestTransfers.push(item);
      });

      return { direct: bestDirect, transfers: bestTransfers };
    },

    fareFor: function (mode) {
      var wanted = mode === "minibus" ? "dolmus" : (mode === "metro" ? "metro" : "otobus");
      var fares = this.meta.fares || [];
      for (var i = 0; i < fares.length; i++) if (fares[i].mode === wanted) return fares[i];
      return null;
    }
  };

  if (global.ADANA_DATA) Data.load(global.ADANA_DATA);
  global.AdanaData = Data;
  global.AdanaNorm = norm;
  global.AdanaTime = {
    minutesOf: minutesOf, timeOf: timeOf, displayTime: displayTime,
    now: istanbulNow, median: median
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Data;
})(typeof window !== "undefined" ? window : globalThis);
