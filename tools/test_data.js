#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");

global.window = global;
require(path.join(__dirname, "..", "www", "data", "network.js"));
const D = require(path.join(__dirname, "..", "www", "js", "data.js"));

function test(name, fn) {
  try {
    fn();
    console.log("OK  " + name);
  } catch (error) {
    console.error("FAIL " + name);
    console.error(error.message);
    process.exitCode = 1;
  }
}

test("veri yükleniyor", () => {
  assert.ok(D.ready);
  assert.ok(D.routes.length > 180, "hat sayısı: " + D.routes.length);
  assert.ok(Object.keys(D.stops).length > 3000);
});

test("hat kodları tekil ve 114 var", () => {
  const codes = D.routes.map((r) => r.code);
  assert.strictEqual(new Set(codes).size, codes.length);
  assert.ok(D.routes.some((r) => r.code === "114" && !r.limited));
});

test("tam güzergahlarda durak ve süre eşleşiyor", () => {
  let checked = 0;
  D.routes.forEach((route) => {
    route.dirs.forEach((dir) => {
      if (!dir.stops.length) return;
      assert.strictEqual(dir.stops.length, dir.offsets.length, route.code);
      assert.ok(dir.stops.every((sid) => D.stop(sid)), route.code + " bilinmeyen durak");
      checked++;
    });
  });
  assert.ok(checked > 200, "kontrol edilen yön: " + checked);
});

test("arama: hat numarası, ad ve durak", () => {
  assert.strictEqual(D.searchRoutes("114")[0].code, "114");
  assert.strictEqual(D.searchRoutes("itimat", "minibus").length > 0, true);
  assert.ok(D.searchStops("küçük saat").length > 0);
  assert.ok(D.searchStops("kucuk saat").length > 0, "Türkçe karakter normalizasyonu");
});

test("durak indeksi ve yakın duraklar", () => {
  const stopId = D.routes.find((r) => r.code === "114" && !r.limited).dirs[0].stops[5];
  assert.ok(D.linesAt(stopId).length > 0);
  assert.ok(D.routesAt(stopId).length > 0);
  const near = D.nearbyStops(37.0004, 35.3212, 5, 3000);
  assert.ok(near.length >= 3);
  assert.ok(near[0].dist <= near[near.length - 1].dist);
});

test("doğrudan yolculuk planı", () => {
  const route = D.routes.find((r) => r.code === "114" && !r.limited);
  const dir = route.dirs[0];
  const from = dir.stops[2];
  const to = dir.stops[dir.stops.length - 3];
  const plan = D.plan(from, to);
  assert.ok(plan.direct.length > 0, "doğrudan sonuç yok");
  assert.strictEqual(plan.direct[0].route.code, "114");
  assert.ok(plan.direct[0].mins > 0);
});

test("aktarmalı yolculuk bulunabiliyor", () => {
  let found = null;
  const stops = Object.keys(D.stops).slice(0, 1200);
  for (const from of stops) {
    if (!D.linesAt(from).length) continue;
    for (const to of stops) {
      if (from === to || !D.linesAt(to).length) continue;
      const plan = D.plan(from, to);
      if (!plan.direct.length && plan.transfers.length) { found = plan; break; }
    }
    if (found) break;
  }
  assert.ok(found, "aktarmalı örnek bulunamadı");
  assert.ok(found.transfers[0].mins > 0);
  assert.ok(found.transfers[0].transfer);
});

test("istatistik ve tarife", () => {
  const route = D.routes.find((r) => r.code === "114" && !r.limited);
  const stats = D.stats(route, route.dirs[0]);
  assert.ok(stats.first && stats.last);
  assert.ok(stats.headway >= 0);
  assert.ok(D.fareFor("minibus").cash === 70);
  assert.ok(D.fareFor("metro").card > 0);
});

test("metro hattı", () => {
  const metro = D.routes.find((r) => r.mode === "metro");
  assert.ok(metro);
  assert.strictEqual(metro.dirs.length, 2);
  assert.strictEqual(metro.dirs[0].stops.length, 13);
  assert.ok(metro.dirs[0].dep.wd.length >= 70);
  const plan = D.plan(metro.dirs[0].stops[0], metro.dirs[0].stops[12]);
  assert.ok(plan.direct.length > 0);
});

test("sınırlı hatlar yön bilgisi taşıyor", () => {
  const limited = D.routes.filter((r) => r.limited);
  assert.ok(limited.length > 20);
  limited.forEach((route) => {
    assert.ok(route.dirs.length >= 1);
    assert.strictEqual(route.dirs[0].stops.length, 0);
  });
});

if (!process.exitCode) console.log("\nTüm veri testleri geçti.");
