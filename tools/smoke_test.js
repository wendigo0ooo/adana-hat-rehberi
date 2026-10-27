"use strict";

const fs = require("fs");
const path = require("path");

let JSDOM;
try {
  JSDOM = require("jsdom").JSDOM;
} catch (error) {
  console.error("jsdom bulunamadı. Kurulum: npm install --no-save jsdom");
  process.exit(2);
}

const ROOT = path.join(__dirname, "..", "www");
const failures = [];

function ok(condition, label) {
  console.log((condition ? "OK   " : "FAIL ") + label);
  if (!condition) failures.push(label);
}

function layer() {
  const obj = {
    addTo() { return obj; },
    bindTooltip() { return obj; },
    on() { return obj; },
    bringToBack() { return obj; }
  };
  return obj;
}

const L = {
  map() {
    return {
      setView() { return this; },
      fitBounds() { return this; },
      remove() {},
      invalidateSize() {},
      removeLayer() {},
      attributionControl: { setPrefix() {} }
    };
  },
  GridLayer: { extend() { return function () { return layer(); }; } },
  control: {
    zoom() { return layer(); },
    attribution() { return layer(); }
  },
  polyline() { return layer(); },
  circleMarker() { return layer(); },
  circle() { return layer(); },
  tileLayer() { return layer(); },
  latLngBounds() { return { extend() { return this; } }; }
};

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>/g, "");

const dom = new JSDOM(html, {
  url: "http://localhost/#/",
  runScripts: "outside-only",
  pretendToBeVisual: true
});
const window = dom.window;
const document = window.document;
window.scrollTo = function () {};
window.matchMedia = function () {
  return { matches: false, addEventListener() {}, removeEventListener() {} };
};
window.L = L;
window.navigator.geolocation = {
  getCurrentPosition(success) {
    success({ coords: { latitude: 37.0004, longitude: 35.3212 } });
  }
};

["data/network.js", "js/data.js", "js/ui.js", "js/map.js", "js/app.js"].forEach(function (file) {
  window.eval(fs.readFileSync(path.join(ROOT, file), "utf8"));
});

function navigate(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent("hashchange"));
}

function input(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

ok(!!document.getElementById("searchInput"), "ana sayfa ve arama kutusu render edildi");
ok(document.querySelectorAll(".mode-chips .chip").length === 4, "tür filtreleri var");
ok(document.querySelectorAll("#homeDefault .route-card").length >= 5, "popüler hatlar listeleniyor");
ok(document.getElementById("topSub").textContent.indexOf("189 hat") >= 0, "üst başlıkta veri sayısı");

input(document.getElementById("searchInput"), "114");
ok(document.getElementById("searchResults").textContent.indexOf("114") >= 0, "hat numarası araması");
input(document.getElementById("searchInput"), "küçük saat");
ok(document.getElementById("searchResults").textContent.indexOf("Duraklar") >= 0, "durak araması");

navigate("#/route/00114/0");
ok(document.getElementById("topTitle").textContent.indexOf("114") >= 0, "hat detayı başlığı");
ok(document.querySelectorAll(".stop-timeline li").length > 40, "hat durakları listelendi");
ok(!!document.getElementById("routeMap"), "güzergah haritası oluşturuldu");
document.querySelector('.day-tab[data-key="su"]').click();
ok(document.querySelectorAll(".time").length === 0, "pazar günü sefer yok uyarısı");
document.querySelector('.day-tab[data-key="wd"]').click();
ok(document.querySelectorAll(".time").length > 5, "hafta içi kalkış saatleri listelendi");
const segLinks = document.querySelectorAll(".segmented .seg");
ok(segLinks.length === 2, "iki yön seçeneği var");
const firstStopLink = document.querySelector(".stop-timeline li a");
const firstStopHref = firstStopLink.getAttribute("href");

navigate(firstStopHref);
ok(document.querySelectorAll(".line-group").length > 0, "durak detayında hatlar listelendi");
ok(!!document.getElementById("stopMap"), "durak haritası oluşturuldu");

const route = window.AdanaData.route("00114");
const dir = route.dirs[0];
const from = dir.stops[2];
const to = dir.stops[dir.stops.length - 3];
navigate("#/plan/" + from + "/" + to);
ok(document.getElementById("planResults").textContent.indexOf("Aktarmasız") >= 0, "aktarmasız plan sonucu");
ok(document.querySelectorAll(".journey").length > 0, "yolculuk kartları render edildi");

navigate("#/route/00114/0");
document.getElementById("topAction").click();
const saved = JSON.parse(window.localStorage.getItem("ahr_favs_v1") || "{}");
ok((saved.routes || []).indexOf("00114") >= 0, "favoriye ekleme");
navigate("#/favorites");
ok(!!document.querySelector('.route-list a[href*="00114"]'), "favoriler sayfasında hat var");

navigate("#/info");
ok(document.querySelectorAll(".fare-table tbody tr").length >= 4, "ücret tablosu");
ok(document.body.textContent.indexOf("M1") >= 0, "metro bilgisi");

navigate("#/route/official-105/0");
ok(document.body.textContent.indexOf("Sınırlı veri") >= 0, "sınırlı hat uyarısı");

navigate("#/");
window.onNativeLocation(37.0004, 35.3212);
ok(document.querySelectorAll("#nearbyBox .stop-row").length > 0, "konumla yakın duraklar");

const planTab = document.querySelector('.tab[data-tab="plan"]');
ok(!!planTab && planTab.getAttribute("href") === "#/plan", "plan sekmesi bağlantısı");
navigate("#/plan");
ok(document.getElementById("fromInput") && document.getElementById("toInput"), "plan sekmesi formu");
ok(document.querySelectorAll('.tabbar .tab').length === 4, "alt menü dört sekme");

navTest();
function navTest() {
  const stopId = window.AdanaData.route("00114").dirs[0].stops[4];
  window.App.openStop(stopId);
  window.dispatchEvent(new window.HashChangeEvent("hashchange"));
  ok(document.getElementById("topAction").dataset.type === "stop", "harita işaretçisinden durak açma");
}

if (failures.length) {
  console.error("\n" + failures.length + " test başarısız.");
  process.exitCode = 1;
} else {
  console.log("\nTüm arayüz testleri geçti.");
}
