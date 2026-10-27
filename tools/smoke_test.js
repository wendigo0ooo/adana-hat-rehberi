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

const mapStats = { maps: 0, grids: 0, polylines: 0, markers: 0, fits: 0, tiles: 0 };

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
    mapStats.maps += 1;
    const map = {
      setView() { return map; },
      fitBounds() { mapStats.fits += 1; return map; },
      remove() {},
      invalidateSize() {},
      removeLayer() {},
      attributionControl: { setPrefix() {} }
    };
    return map;
  },
  GridLayer: {
    extend() {
      function Grid() {
        if (!(this instanceof Grid)) throw new Error("GridLayer sınıfı new olmadan çağrıldı");
        this.getTileSize = () => ({ x: 256, y: 256 });
        this.addTo = () => { mapStats.grids += 1; return this; };
        this.bringToBack = () => this;
      }
      return Grid;
    }
  },
  control: {
    zoom() { return layer(); },
    attribution() { return layer(); }
  },
  polyline() { mapStats.polylines += 1; return layer(); },
  circleMarker() { mapStats.markers += 1; return layer(); },
  circle() { mapStats.markers += 1; return layer(); },
  tileLayer() { mapStats.tiles += 1; return layer(); },
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async function main() {

ok(!!document.getElementById("searchInput"), "ana sayfa ve arama kutusu render edildi");
ok(document.querySelectorAll(".mode-chips .chip").length === 4, "tür filtreleri var");
ok(document.querySelectorAll("#homeDefault .route-card").length >= 5, "popüler hatlar listeleniyor");
ok(document.getElementById("topSub").textContent.indexOf("189 hat") >= 0, "üst başlıkta veri sayısı");

input(document.getElementById("searchInput"), "114");
await wait(180);
ok(document.getElementById("searchResults").textContent.indexOf("114") >= 0, "hat numarası araması");
input(document.getElementById("searchInput"), "küçük saat");
await wait(180);
ok(document.getElementById("searchResults").textContent.indexOf("Duraklar") >= 0, "durak araması");

navigate("#/route/00114/0");
ok(document.getElementById("topTitle").textContent.indexOf("114") >= 0, "hat detayı başlığı");
ok(document.querySelectorAll(".stop-timeline li").length > 40, "hat durakları listelendi");
ok(!!document.getElementById("routeMap"), "güzergah haritası kapsayıcısı var");
ok(mapStats.maps > 0 && mapStats.grids > 0, "harita ve şematik zemin başlatıldı");
ok(mapStats.polylines >= 2, "güzergah çizgisi çizildi");
ok(mapStats.markers > 40, "güzergah durak işaretleri eklendi");
ok(mapStats.fits > 0, "harita güzergaha sığdırıldı");
const boardCard = document.querySelector(".boarding-card");
ok(!!boardCard && boardCard.textContent.indexOf("Kalkış durağı") >= 0, "kalkış durağı bilgisi gösterildi");
ok(!!boardCard && boardCard.textContent.indexOf("Varış durağı") >= 0, "varış durağı bilgisi gösterildi");
ok(!!document.querySelector(".stop-tag.tag-start"), "ilk durak kalkış olarak işaretlendi");
document.querySelector('.day-tab[data-key="su"]').click();
ok(document.querySelectorAll(".time").length === 0, "pazar günü sefer yok uyarısı");
ok(!document.querySelector(".stats-grid"), "pazar günü sahte istatistik gösterilmiyor");
const sundayNotice = document.querySelector("#timelineCard .notice");
ok(!!sundayNotice && sundayNotice.textContent.indexOf("sefer bilgisi yok") >= 0,
  "pazar günü durak listesinde dürüst uyarı var");
ok(Array.from(document.querySelectorAll("#timelineCard .stime")).every((el) => el.textContent === ""),
  "pazar günü sahte varış saati gösterilmiyor");
document.querySelector('.day-tab[data-key="wd"]').click();
ok(document.querySelectorAll(".time").length > 5, "hafta içi kalkış saatleri listelendi");
ok(Array.from(document.querySelectorAll("#timelineCard .stime")).some((el) => el.textContent !== ""),
  "gün değişince durak saatleri yenileniyor");
const segLinks = document.querySelectorAll(".segmented .seg");
ok(segLinks.length === 2, "iki yön seçeneği var");
const firstStopLink = document.querySelector(".stop-timeline li a");
const firstStopHref = firstStopLink.getAttribute("href");

navigate(firstStopHref);
ok(document.querySelectorAll(".line-group").length > 0, "durak detayında hatlar listelendi");
ok(!!document.getElementById("stopMap"), "durak haritası kapsayıcısı var");
ok(mapStats.maps >= 2 && mapStats.markers > 40, "durak haritası çizildi");

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
})();
