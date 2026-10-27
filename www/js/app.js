(function () {
  "use strict";

  var D = window.AdanaData;
  var U = window.UI;
  if (!D.ready) D.load(window.ADANA_DATA || { routes: [], stops: {}, meta: {} });

  var view = document.getElementById("view");
  var topTitle = document.getElementById("topTitle");
  var topSub = document.getElementById("topSub");
  var backBtn = document.getElementById("backBtn");
  var topAction = document.getElementById("topAction");

  var FAV_KEY = "ahr_favs_v1";
  var RECENT_KEY = "ahr_recent_v1";

  var state = {
    query: "",
    mode: "all",
    timeKey: null,
    plan: { from: null, to: null, walk: null },
    current: null,
    locating: false,
    locateTimer: null,
    lastFix: null,
    locateTarget: null,
    timeKeyRoute: null
  };

  function favs() {
    var f = U.safeGet(FAV_KEY, {});
    f.routes = f.routes || [];
    f.stops = f.stops || [];
    return f;
  }

  function isFav(type, id) {
    var f = favs();
    return (type === "route" ? f.routes : f.stops).indexOf(id) >= 0;
  }

  function toggleFav(type, id) {
    var f = favs();
    var list = type === "route" ? f.routes : f.stops;
    var index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1); else list.push(id);
    U.safeSet(FAV_KEY, f);
    refreshFav(type, id, index < 0);
    U.toast(index < 0 ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
    return index < 0;
  }

  function refreshFav(type, id, active) {
    if (topAction && topAction.dataset.type === type && topAction.dataset.id === id) {
      topAction.classList.toggle("is-fav", active);
      topAction.setAttribute("aria-pressed", active ? "true" : "false");
      topAction.innerHTML = U.icon("star");
    }
    document.querySelectorAll('[data-action="toggle-fav"]').forEach(function (btn) {
      if (btn.dataset.type === type && btn.dataset.id === id) {
        btn.classList.toggle("is-fav", active);
        btn.setAttribute("aria-label", active ? "Favorilerden çıkar" : "Favorilere ekle");
      }
    });
  }

  function recents() {
    var list = U.safeGet(RECENT_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function addRecent(type, id) {
    var list = recents().filter(function (item) { return !(item.type === type && item.id === id); });
    list.unshift({ type: type, id: id });
    U.safeSet(RECENT_KEY, list.slice(0, 10));
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function setHeader(opts) {
    backBtn.hidden = !opts.back;
    topTitle.textContent = opts.title;
    topSub.textContent = opts.sub || "";
    if (opts.action) {
      topAction.hidden = false;
      topAction.dataset.type = opts.action.type;
      topAction.dataset.id = opts.action.id;
      topAction.classList.toggle("is-fav", !!opts.action.active);
      topAction.setAttribute("aria-label", opts.action.active ? "Favorilerden çıkar" : "Favorilere ekle");
      topAction.setAttribute("aria-pressed", opts.action.active ? "true" : "false");
      topAction.innerHTML = U.icon("star");
    } else {
      topAction.hidden = true;
      topAction.removeAttribute("data-type");
      topAction.removeAttribute("data-id");
      topAction.innerHTML = "";
    }
  }

  function setTab(tab) {
    document.querySelectorAll(".tab").forEach(function (a) {
      var active = a.dataset.tab === tab;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function showTabbar(show) {
    document.body.classList.toggle("detail", !show);
  }

  function parseHash() {
    var raw = location.hash.replace(/^#/, "") || "/";
    var parts;
    try {
      parts = raw.split("/").filter(function (p) { return p.length; }).map(decodeURIComponent);
    } catch (e) {
      return { name: "home" };
    }
    if (!parts.length) return { name: "home" };
    if (parts[0] === "route" && parts[1]) {
      return { name: "route", id: parts[1], d: parts[2] != null ? parseInt(parts[2], 10) : null };
    }
    if (parts[0] === "stop" && parts[1]) return { name: "stop", id: parts[1] };
    if (parts[0] === "plan") return { name: "plan", from: parts[1] || null, to: parts[2] || null };
    if (parts[0] === "favorites") return { name: "favorites" };
    if (parts[0] === "info") return { name: "info" };
    return { name: "home" };
  }

  function counts() {
    var c = D.meta.counts || {};
    return (c.routes || D.routes.length) + " hat · " + (c.stops || Object.keys(D.stops).length) + " durak · M1 metro";
  }

  function render() {
    var route = parseHash();
    window.MapView.destroy();
    window.scrollTo(0, 0);
    state.current = null;

    if (route.name === "route") { renderRoute(route); return; }
    if (route.name === "stop") { renderStop(route); return; }

    showTabbar(true);
    setTab(route.name);
    if (route.name === "plan") renderPlan(route);
    else if (route.name === "favorites") renderFavorites();
    else if (route.name === "info") renderInfo();
    else renderHome();
  }

  function stopCodes(stopId, limit) {
    var seen = {};
    var out = [];
    (D.linesAt(stopId) || []).forEach(function (line) {
      var code = line.route.code;
      if (seen[code]) return;
      seen[code] = true;
      out.push(code);
    });
    return out.slice(0, limit || 4);
  }

  function updateHomeResults() {
    var results = document.getElementById("searchResults");
    var def = document.getElementById("homeDefault");
    if (!results || !def) return;
    var q = state.query.trim();
    if (!q) { results.innerHTML = ""; def.hidden = false; return; }
    def.hidden = true;

    var routes = D.searchRoutes(q, state.mode, 40);
    var stops = D.searchStops(q, 12);
    var html = "";

    if (routes.length) {
      html += '<section class="block"><div class="block-head"><h3>Hatlar</h3><span class="muted">' +
        routes.length + '</span></div><div class="route-list">' +
        routes.map(U.routeCard).join("") + "</div></section>";
    }
    if (stops.length) {
      html += '<section class="block"><div class="block-head"><h3>Duraklar</h3><span class="muted">' +
        stops.length + '</span></div><div class="stop-list">' +
        stops.map(function (s) {
          return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length, codes: stopCodes(s.id) });
        }).join("") + "</div></section>";
    }
    if (!html && state.mode !== "all") {
      var any = D.searchRoutes(q, "all", 1);
      html = '<div class="empty">Bu filtrede sonuç yok.' +
        (any.length ? " Tüm türlerde arama yapmayı deneyin." : "") + "</div>";
    }
    if (!html) {
      html = '<div class="empty">"' + U.esc(q) + '" için sonuç bulunamadı.<br><small>Hat numarası, hat adı veya durak adı ile arayın.</small></div>';
    }
    results.innerHTML = html;
  }

  var searchTimer = null;
  var searchLastRun = 0;
  function scheduleHomeResults() {
    var now = Date.now();
    clearTimeout(searchTimer);
    if (now - searchLastRun > 150) {
      searchLastRun = now;
      updateHomeResults();
      return;
    }
    searchTimer = setTimeout(function () {
      searchLastRun = Date.now();
      updateHomeResults();
    }, 130);
  }

  function homePopular() {
    var list = D.routes.filter(function (r) {
      if (r.limited || r.mode === "metro") return false;
      return state.mode === "all" || r.mode === state.mode;
    });
    list.sort(function (a, b) { return D.popularity(b) - D.popularity(a); });
    return list.slice(0, 8);
  }

  function operatorGroups() {
    var groups = new Map();
    D.routes.forEach(function (r) {
      if (r.mode !== "minibus") return;
      if (!r.operator || r.operator.indexOf("Büyükşehir") >= 0) return;
      if (!groups.has(r.operator)) groups.set(r.operator, { name: r.operator, count: 0, sample: r });
      groups.get(r.operator).count += 1;
    });
    return Array.from(groups.values()).sort(function (a, b) { return b.count - a.count; });
  }

  function recentBlock() {
    var items = recents();
    var rows = [];
    items.forEach(function (item) {
      if (item.type === "route") {
        var route = D.route(item.id);
        if (route) rows.push(U.routeCard(route));
      } else {
        var s = D.stop(item.id);
        if (s) rows.push(U.stopRow({ id: item.id, name: s[0], kind: s[3], dist: null }, { lines: (D.linesAt(item.id) || []).length }));
      }
    });
    if (!rows.length) return "";
    return '<section class="block"><div class="block-head"><h3>Son baktıkların</h3></div>' +
      '<div class="mixed-list">' + rows.join("") + "</div></section>";
  }

  function freshnessInfo() {
    var feed = (D.meta && D.meta.feed) || {};
    if (!feed.validUntil) return null;
    var end = new Date(feed.validUntil + "T23:59:59");
    if (isNaN(end.getTime())) return null;
    var days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    if (days < 0) {
      return {
        level: "error",
        title: "Veri güncelliği",
        text: "Bu sürümdeki tarife " + feed.validUntil + " tarihinde doldu. Sefer saatleri güncel olmayabilir; resmî kanalları kontrol edin."
      };
    }
    if (days <= 14) {
      return {
        level: "warn",
        title: "Veri güncelliği",
        text: "Tarife " + feed.validUntil + " tarihine kadar geçerli (" + days + " gün kaldı)."
      };
    }
    return null;
  }

  function freshnessBanner() {
    var info = freshnessInfo();
    if (!info) return "";
    return '<div class="notice ' + info.level + '">' + U.icon("info") + "<div><strong>" +
      U.esc(info.title) + "</strong><span>" + U.esc(info.text) + "</span></div></div>";
  }

  function routeByCode(code) {
    var wanted = String(code);
    for (var i = 0; i < D.routes.length; i++) {
      if (String(D.routes[i].code) === wanted) return D.routes[i];
    }
    return null;
  }

  function announceCard(item) {
    var chips = (item.routes || []).map(function (code) {
      var route = routeByCode(code);
      if (!route) return '<span class="chip xs">' + U.esc(code) + "</span>";
      return '<a class="chip xs" href="#/route/' + encodeURIComponent(route.id) + '">' + U.esc(code) + "</a>";
    }).join("");
    var range = [item.start, item.end].filter(Boolean).join(" – ");
    return '<article class="announce">' +
      '<div class="announce-head"><strong>' + U.esc(item.title) + "</strong>" +
      (range ? '<span class="announce-date">' + U.esc(range) + "</span>" : "") + "</div>" +
      (item.text ? '<p class="announce-text">' + U.esc(item.text) + "</p>" : "") +
      (chips ? '<div class="announce-chips">' + chips + "</div>" : "") +
      "</article>";
  }

  function announcementsBlock() {
    var list = D.activeAnnouncements();
    if (!list.length) return "";
    var favCodes = favs().routes.map(function (id) {
      var route = D.route(id);
      return route ? String(route.code) : null;
    }).filter(Boolean);
    list.sort(function (a, b) {
      var af = (a.routes || []).some(function (c) { return favCodes.indexOf(String(c)) >= 0; }) ? 1 : 0;
      var bf = (b.routes || []).some(function (c) { return favCodes.indexOf(String(c)) >= 0; }) ? 1 : 0;
      if (af !== bf) return bf - af;
      return String(b.start || "").localeCompare(String(a.start || ""));
    });
    var shown = list.slice(0, 3);
    return '<section class="block"><div class="block-head"><h3>Duyurular</h3><span class="muted">' +
      list.length + '</span></div><div class="announce-list">' +
      shown.map(announceCard).join("") + "</div>" +
      (list.length > shown.length ? '<a class="btn ghost wide" href="#/info">Tüm duyurular</a>' : "") +
      "</section>";
  }

  function nearbyIntro() {
    return '<div class="nearby-intro"><span class="pin-badge">' + U.icon("locate") + "</span>" +
      "<div><strong>Yakınındaki durakları gör</strong><small>Konum yalnızca cihazında hesaplanır.</small></div></div>";
  }

  function renderHome(focusSearch) {
    setHeader({ title: "Adana Hat Rehberi", sub: counts(), back: false });
    showTabbar(true);
    setTab("home");

    var modes = [
      { id: "all", label: "Tümü" },
      { id: "bus", label: "Otobüs" },
      { id: "minibus", label: "Dolmuş" },
      { id: "metro", label: "Metro" }
    ];

    var popular = homePopular();
    var operators = operatorGroups().slice(0, 10);
    var metro = D.routes.filter(function (r) { return r.mode === "metro"; })[0];

    view.innerHTML = '<div class="page home">' +
      '<section class="hero">' +
      '<p class="eyebrow">Adana toplu taşıma rehberi</p>' +
      '<h2 class="hero-title">Nereye gidiyorsun?</h2>' +
      '<div class="search-box">' + U.icon("search") +
      '<input id="searchInput" type="search" inputmode="search" autocomplete="off" ' +
      'placeholder="Hat no, hat adı veya durak" value="' + U.esc(state.query) + '" aria-label="Ara">' +
      '<button class="clear-btn" data-action="clear-search" aria-label="Temizle">' + U.icon("close") + "</button></div>" +
      '<div class="chips mode-chips">' + modes.map(function (m) {
        return '<button class="chip ' + (state.mode === m.id ? "active" : "") + '" data-action="mode" data-mode="' +
          m.id + '">' + m.label + "</button>";
      }).join("") + "</div></section>" +
      freshnessBanner() +
      '<div id="searchResults"></div>' +
      '<div id="homeDefault" class="home-default">' +
      '<section class="block"><div class="block-head"><h3>Yakınımdaki duraklar</h3>' +
      '<button class="btn ghost sm" data-action="locate">' + U.icon("locate") + " Konumumu kullan</button></div>" +
      '<div id="nearbyBox" class="card soft">' + nearbyIntro() + "</div></section>" +
      announcementsBlock() +
      (popular.length ? '<section class="block"><div class="block-head"><h3>Popüler hatlar</h3></div>' +
        '<div class="route-list">' + popular.map(U.routeCard).join("") + "</div></section>" : "") +
      (state.mode === "all" && operators.length ? '<section class="block"><div class="block-head"><h3>Dolmuş kooperatifleri</h3></div>' +
        '<div class="chips op-chips">' + operators.map(function (op) {
          return '<button class="chip op-chip" data-action="search-op" data-q="' + U.esc(op.name) + '">' +
            U.esc(op.name.replace(/ Nolu.*/, "")) + '<span>' + op.count + "</span></button>";
        }).join("") + "</div></section>" : "") +
      (metro && (state.mode === "all" || state.mode === "metro") ? '<section class="block"><div class="block-head"><h3>Raylı sistem</h3></div>' +
        '<div class="route-list">' + U.routeCard(metro) + "</div></section>" : "") +
      recentBlock() +
      "</div></div>";

    updateHomeResults();
    if (state.lastFix) showNearby(state.lastFix.lat, state.lastFix.lon);
    if (focusSearch) {
      var input = document.getElementById("searchInput");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  function showNearby(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { U.toast("Konum alınamadı", "error"); return; }
    state.lastFix = { lat: lat, lon: lon };
    var box = document.getElementById("nearbyBox");
    if (!box) return;
    var stops = D.nearbyStops(lat, lon, 10, 2500);
    if (!stops.length) {
      box.innerHTML = '<p class="empty">2,5 km içinde durak bulunamadı.</p>';
      return;
    }
    box.innerHTML = '<p class="nearby-title">En yakın duraklar <button class="link-btn" data-action="locate">yenile</button></p>' +
      '<div class="stop-list">' +
      stops.map(function (s) {
        return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length, codes: stopCodes(s.id) });
      }).join("") + "</div>";
  }

  function stopLocateTimer() {
    if (state.locateTimer) { clearTimeout(state.locateTimer); state.locateTimer = null; }
  }

  function locateFailed(message) {
    state.locating = false;
    stopLocateTimer();
    U.toast(message || "Konum alınamadı. Konum iznini kontrol edin.", "error");
    if (state.locateTarget === "plan") {
      state.locateTarget = null;
      return;
    }
    var box = document.getElementById("nearbyBox");
    if (box && !state.lastFix) box.innerHTML = nearbyIntro();
  }

  function setPlanFromFix(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      U.toast("Konum alınamadı", "error");
      return;
    }
    var near = D.nearbyStops(lat, lon, 1, 5000)[0];
    if (!near) {
      U.toast("5 km içinde durak bulunamadı.", "error");
      return;
    }
    state.plan.from = { id: near.id, name: near.name };
    state.plan.walk = near.dist;
    var input = document.getElementById("fromInput");
    if (input) input.value = near.name;
    var results = document.getElementById("planResults");
    if (results) results.innerHTML = planResults();
    U.toast("En yakın durak seçildi: " + near.name);
  }

  function locate(target) {
    state.locating = true;
    state.locateTarget = target || "home";
    stopLocateTimer();
    var box = document.getElementById("nearbyBox");
    if (box) box.innerHTML = '<div class="loading">' + U.icon("locate") + " Konum alınıyor…</div>";

    state.locateTimer = setTimeout(function () {
      locateFailed("Konum alınamadı. Açık alanda tekrar deneyin.");
    }, 25000);

    if (window.AndroidBridge && window.AndroidBridge.requestLocation) {
      try { window.AndroidBridge.requestLocation(); return; } catch (e) {}
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.locating = false;
        stopLocateTimer();
        showNearby(Number(pos.coords.latitude), Number(pos.coords.longitude));
      }, function () {
        locateFailed("Konum alınamadı. Konum iznini kontrol edin.");
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
      return;
    }
    locateFailed("Bu cihazda konum desteklenmiyor.");
  }

  function planField(field, label, iconName, value, placeholder) {
    return '<div class="field"><label for="' + field + 'Input">' + U.icon(iconName) + label + "</label>" +
      '<div class="ac-wrap"><input id="' + field + 'Input" data-ac="' + field + '" autocomplete="off" ' +
      'role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + field + 'Sug" ' +
      'placeholder="' + placeholder + '" value="' + U.esc(value || "") + '">' +
      '<div class="suggest" id="' + field + 'Sug" role="listbox" hidden></div></div></div>';
  }

  function planResults() {
    var from = state.plan.from;
    var to = state.plan.to;
    if (!from || !to) {
      return '<div class="card soft plan-help">' + U.icon("plan") +
        "<div><strong>İki durak seç</strong><small>Kalkış ve varış durağını yazarak seç; doğrudan ve tek aktarmalı hatları gösterelim.</small></div></div>";
    }
    if (from.id === to.id) return '<div class="empty">Kalkış ve varış aynı durak.</div>';

    var plan = D.plan(from.id, to.id);
    var html = '<div class="plan-summary">' + U.esc(from.name) +
      (state.plan.walk ? ' <span class="muted">(konumdan ~' + Math.round(state.plan.walk) + " m)</span>" : "") +
      " → " + U.esc(to.name) + "</div>";

    if (!plan.direct.length && !plan.transfers.length) {
      return html + '<div class="empty">Bu iki durak arasında uygun hat bulunamadı.<br><small>Daha yakın bir durak seçmeyi deneyin.</small></div>';
    }

    if (plan.direct.length) {
      html += '<section class="block"><div class="block-head"><h3>Aktarmasız</h3><span class="muted">' +
        plan.direct.length + '</span></div><div class="journey-list">' +
        plan.direct.map(U.journeyDirect).join("") + "</div></section>";
    }
    if (plan.transfers.length) {
      html += '<section class="block"><div class="block-head"><h3>1 aktarmalı</h3><span class="muted">' +
        plan.transfers.length + '</span></div><div class="journey-list">' +
        plan.transfers.map(U.journeyTransfer).join("") + "</div></section>";
    }
    if (!plan.direct.length) {
      html += '<div class="notice">Doğrudan hat yok; sonuçlar tek aktarmalı seçeneklerdir.</div>';
    }
    html += '<p class="hint">Süreler yaklaşıktır. Varış saati "şimdi çıksan" varsayımıyla hesaplanır; bekleme ve yürüme süreleri tahminidir.</p>';
    return html;
  }

  function renderPlan(route) {
    setHeader({ title: "Yolculuk planla", sub: "Nereden → nereye", back: false });
    showTabbar(true);
    setTab("plan");

    if (route.from) state.plan.from = { id: route.from, name: D.stopName(route.from) };
    if (route.to) state.plan.to = { id: route.to, name: D.stopName(route.to) };

    view.innerHTML = '<div class="page plan">' +
      '<div class="card plan-form">' +
      planField("from", "Nereden", "pin", state.plan.from && state.plan.from.name, "Kalkış durağı ara") +
      '<button class="btn ghost sm plan-locate" data-action="plan-locate">' + U.icon("locate") +
      " Konumumu kullan</button>" +
      '<button class="swap-btn" data-action="swap" aria-label="Yönleri değiştir">' + U.icon("swap") + "</button>" +
      planField("to", "Nereye", "pin", state.plan.to && state.plan.to.name, "Varış durağı ara") +
      '<button class="btn primary" data-action="plan-submit">' + U.icon("search") + " Yolculuk ara</button>" +
      "</div>" +
      '<div id="planResults">' + planResults() + "</div>" +
      "</div>";
  }

  function timesCard(route, dir) {
    var key = state.timeKey || D.todayKey();
    var dep = D.departures(dir, key);
    var today = key === D.todayKey();
    var nextIndex = -1;
    if (today) {
      var now = window.AdanaTime.now();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < 240) nowMin += 1440;
      for (var i = 0; i < dep.length; i++) {
        if (window.AdanaTime.minutesOf(dep[i]) >= nowMin) { nextIndex = i; break; }
      }
    }
    return '<div class="card" id="timesCard"><div class="card-head"><h3>Kalkış saatleri</h3><span class="muted">' +
      (dep.length ? dep.length + " sefer" : "") + "</span></div>" +
      '<div class="day-tabs">' + [["wd", "Hafta içi"], ["sa", "Cumartesi"], ["su", "Pazar"]].map(function (d) {
        return '<button class="day-tab ' + (key === d[0] ? "active" : "") + '" data-action="day" data-key="' +
          d[0] + '">' + d[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="time-grid" role="list">' + (dep.length ? dep.map(function (t, i) {
        var next = i === nextIndex;
        return '<span class="time ' + (next ? "next" : "") + '" role="listitem"' +
          (next ? ' aria-current="time" aria-label="Sıradaki sefer ' + window.AdanaTime.displayTime(t) + '"' : "") +
          ">" + window.AdanaTime.displayTime(t) + "</span>";
      }).join("") : '<p class="empty">Bu gün için sefer bilgisi yok.</p>') + "</div>" +
      '<p class="hint">' + (dir.dataLevel === "full"
        ? "Saatler hattın ilk durağından kalkış saatleridir. Sonraki duraklar için aşağıdaki süreleri ekleyin."
        : "Saatler kalkış durağından alınmıştır; ara duraklar için süreler yaklaşıktır.") + "</p></div>";
  }

  function stopsTimeline(dir) {
    var key = state.timeKey || D.todayKey();
    var dep = D.departures(dir, key);
    var hasService = dep.length > 0;
    var base = hasService ? dep[0] : null;
    var baseLabel = "İlk sefer";
    if (hasService && key === D.todayKey()) {
      var now = window.AdanaTime.now();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < 240) nowMin += 1440;
      var next = -1;
      for (var n = 0; n < dep.length; n++) {
        if (window.AdanaTime.minutesOf(dep[n]) >= nowMin) { next = n; break; }
      }
      if (next >= 0) { base = dep[next]; baseLabel = "Sıradaki sefer"; }
      else { base = dep[dep.length - 1]; baseLabel = "Son sefer"; }
    }
    var lastIndex = dir.stops.length - 1;

    var head = hasService
      ? '<p class="hint timeline-hint">' + (dir.dataLevel === "full"
          ? "Süreler kalkış durağına göre yaklaşık varış saatleridir."
          : "Varış saatleri durak mesafelerinden yaklaşık hesaplanmıştır.") + "</p>"
      : '<div class="notice warn compact">' + U.icon("info") + "<div><strong>" +
        U.esc(D.dayLabel(key)) + " için sefer bilgisi yok</strong><span>Bu hat için " +
        U.esc(D.dayLabel(key).toLowerCase()) + " seferi yayımlanmamış. Durak sırası yine de gösteriliyor.</span></div></div>";

    return '<div class="card" id="timelineCard"><div class="card-head"><h3>Duraklar</h3><span class="muted">' +
      dir.stops.length + " durak" + (base ? " · " + baseLabel + " " + window.AdanaTime.displayTime(base) : "") +
      "</span></div>" + head + "<ol class=\"stop-timeline\">" +
      dir.stops.map(function (sid, i) {
        var stop = D.stop(sid);
        var name = stop ? stop[0] : "Durak";
        var time = hasService ? D.arrivalAt(dir, i, base) : "";
        var terminal = i === 0 || i === lastIndex;
        var tag = i === 0 ? '<span class="stop-tag tag-start">Kalkış</span>' :
          (i === lastIndex ? '<span class="stop-tag">Son durak</span>' : "");
        return "<li><a href=\"#/stop/" + encodeURIComponent(sid) + "\">" +
          '<span class="rail"><span class="dot' + (terminal ? " terminal" : "") + '"></span></span>' +
          '<span class="seq">' + (i + 1) + "</span>" +
          '<span class="sname">' + U.esc(name) + "</span>" + tag +
          '<span class="stime">' + (time || "") + "</span></a></li>";
      }).join("") + "</ol></div>";
  }

  function dirLabel(dir) {
    if (dir && dir.stops && dir.stops.length) {
      return U.esc(D.stopName(dir.stops[0])) + " → " + U.esc(D.stopName(dir.stops[dir.stops.length - 1]));
    }
    return U.esc(dir ? dir.heads : "");
  }

  function splitHeads(heads) {
    var parts = String(heads || "").split(/\s*(?:→|->|–|—)\s*/);
    if (parts.length < 2) return null;
    return { from: parts[0], to: parts.slice(1).join(" → ") };
  }

  function boardingCard(dir) {
    if (!dir || !dir.stops || dir.stops.length < 2) return "";
    var origin = D.stop(dir.stops[0]);
    var dest = D.stop(dir.stops[dir.stops.length - 1]);
    if (!origin || !dest) return "";
    return '<div class="card boarding-card">' +
      '<div class="boarding-row"><span class="boarding-k">' + U.icon("pin", "ic-xs") + " Kalkış durağı</span>" +
      '<a class="boarding-v" href="#/stop/' + encodeURIComponent(dir.stops[0]) + '">' + U.esc(origin[0]) + "</a></div>" +
      '<div class="boarding-row"><span class="boarding-k">' + U.icon("pin", "ic-xs") + " Varış durağı</span>" +
      '<a class="boarding-v" href="#/stop/' + encodeURIComponent(dir.stops[dir.stops.length - 1]) + '">' +
      U.esc(dest[0]) + "</a></div>" +
      '<p class="boarding-note">' + U.icon("bus", "ic-xs") +
      " Aracı bu duraktan binin · Yön: " + U.esc(dir.heads) + "</p></div>";
  }

  function statsCard(route, dir) {
    var key = state.timeKey || D.todayKey();
    var stats = D.stats(route, dir, key);
    if (!stats) return "";
    if (stats.hasService) {
      return '<div class="card stats-grid" id="statsCard">' +
        stat("İlk sefer", window.AdanaTime.displayTime(stats.first) || "—", D.dayLabel(stats.dayKey)) +
        stat("Son sefer", window.AdanaTime.displayTime(stats.last) || "—", D.dayLabel(stats.dayKey)) +
        stat("Sıklık", stats.headway ? "~" + stats.headway + " dk" : "—", "hafta içi") +
        stat("Süre", stats.duration != null ? "~" + stats.duration + " dk" : "—", stats.km ? stats.km + " km" : "") +
        "</div>";
    }
    return '<div class="notice warn" id="statsCard">' + U.icon("info") +
      "<div><strong>" + U.esc(D.dayLabel(stats.dayKey)) + " için sefer bilgisi yok</strong><span>" +
      (stats.weekdayCount
        ? "Bu hat için " + U.esc(D.dayLabel(stats.dayKey).toLowerCase()) + " seferi yayımlanmamış. Hafta içi saatlerini yukarıdaki gün sekmelerinden görebilirsin."
        : "Bu hat için sefer saati verisi bulunmuyor.") +
      "</span></div></div>";
  }

  function routeHero(route) {
    return '<div class="route-hero m-' + route.mode + '">' +
      '<div class="hero-line">' + U.badge(route, "lg") + U.modePill(route.mode) +
      (route.limited ? '<span class="tag tag-limited">Sınırlı veri</span>' :
        (route.partial ? '<span class="tag tag-limited">Kısmi veri</span>' : "")) + "</div>" +
      "<h2>" + U.esc(route.name) + "</h2>" +
      '<p class="operator">' + U.esc(route.operator) + "</p></div>";
  }

  function shareText(type, id) {
    if (type === "route") {
      var route = D.route(id);
      if (!route) return "";
      var dir = route.dirs[0];
      var origin = dir && dir.stops.length ? D.stopName(dir.stops[0]) : null;
      return route.code + " · " + route.name + (origin ? " — Kalkış: " + origin : "") +
        " · Adana Hat Rehberi";
    }
    if (type === "stop") {
      return D.stopName(id) + " durağı · Adana Hat Rehberi";
    }
    return "";
  }

  function renderRoute(route) {
    var r = D.route(route.id);
    if (!r) { renderNotFound("Hat bulunamadı"); return; }

    var dirIndex = 0;
    if (route.d != null) {
      for (var i = 0; i < r.dirs.length; i++) if (r.dirs[i].d === route.d) dirIndex = i;
    }
    var dir = r.dirs[dirIndex];
    if (state.timeKeyRoute !== r.id) {
      state.timeKey = null;
      state.timeKeyRoute = r.id;
    }
    state.current = { type: "route", id: r.id, dirIndex: dirIndex };
    addRecent("route", r.id);

    setHeader({
      back: true,
      title: r.code + " · " + r.name,
      sub: U.modeLabel(r.mode) + (r.limited ? " · sınırlı veri" : ""),
      action: { type: "route", id: r.id, active: isFav("route", r.id) }
    });
    showTabbar(false);

    var body = routeHero(r);

    if (r.dirs.length > 1) {
      body += '<div class="segmented">' + r.dirs.map(function (d, idx) {
        return '<a class="seg ' + (idx === dirIndex ? "active" : "") + '" href="#/route/' +
          encodeURIComponent(r.id) + "/" + d.d + '" title="' + U.esc(d.heads) + '">' + dirLabel(d) + "</a>";
      }).join("") + "</div>";
    } else if (dir && dir.heads) {
      body += '<div class="single-dir">' + U.icon("transfer") + U.esc(dir.heads) + "</div>";
    }

    if (dir && dir.stops && dir.stops.length) body += boardingCard(dir);

    var routeAnns = D.announcementsFor(r.code).slice(0, 2);
    if (routeAnns.length) {
      body += routeAnns.map(function (item) {
        return '<div class="notice warn">' + U.icon("info") + "<div><strong>" +
          U.esc(item.title) + "</strong><span>" + U.esc(item.text) + "</span></div></div>";
      }).join("");
    }

    if (dir && dir.dataLevel && dir.dataLevel !== "full") {
      body += '<div class="notice">' + U.icon("info") + "<div><strong>Kısmi veri</strong><span>" +
        (dir.dataLevel === "approx"
          ? "Duraklar ve güzergah resmî kaynaktan alınmıştır. Sefer saatleri yalnızca kalkış durağı için geçerlidir; varış süreleri durak mesafelerinden yaklaşık hesaplanır."
          : "Duraklar ve güzergah resmî kaynaktan alınmıştır; bu yön için sefer saati yayımlanmamış.") +
        "</span></div></div>";
    }

    if (r.limited) {
      body += '<div class="notice">' + U.icon("info") +
        "<div><strong>Bu hat için detay verisi yok</strong><span>Resmî listede hat ve yön bilgisi var; durak ve sefer saatleri yayımlanmamış. Güncel bilgi için resmî kanalları kontrol edin.</span></div></div>" +
        '<div class="card"><div class="card-head"><h3>Kalkış ve varış</h3></div><div class="dir-list">' +
        r.dirs.map(function (d) {
          var ends = splitHeads(d.heads);
          if (!ends) return '<div class="dir-item">' + U.icon("transfer") + U.esc(d.heads) + "</div>";
          return '<div class="dir-item dir-item-ends"><div><span>Kalkış</span><strong>' + U.esc(ends.from) +
            "</strong></div>" + U.icon("transfer") + '<div><span>Varış</span><strong>' + U.esc(ends.to) +
            "</strong></div></div>";
        }).join("") +
        "</div><p class=\"hint\">Bu hat için durak listesi ve sefer saati yayımlanmadığından yalnızca yön uçları gösterilir.</p></div>" +
        '<a class="btn ghost" href="https://ulasimbilgi.adana.bel.tr/Otobusler" target="_blank" rel="noopener">Resmî sitede kontrol et</a>' +
        freshnessBanner() +
        sourceNote();
      view.innerHTML = '<div class="page detail-page">' + body + "</div>";
      return;
    }

    if (dir && dir.stops.length) {
      body += statsCard(r, dir);
      body += fareCard(r);
    }

    if (dir && dir.shape && dir.shape.length > 1) {
      body += '<div class="card map-card"><div class="map-toolbar"><h3>Güzergah</h3>' +
        '<button class="map-toggle" data-action="tiles">Sokak haritası</button></div>' +
        '<div id="routeMap" class="map" role="img" aria-label="' + U.esc(r.code) +
        ' hattı güzergah haritası"></div></div>';
    }

    if (dir && dir.stops.length) {
      body += timesCard(r, dir);
      body += stopsTimeline(dir);
    }

    body += '<button class="btn ghost wide" data-action="share" data-type="route" data-id="' +
      U.esc(r.id) + '">' + U.icon("transfer") + " Hattı paylaş</button>";
    body += freshnessBanner();
    body += sourceNote();
    view.innerHTML = '<div class="page detail-page">' + body + "</div>";

    if (dir && dir.shape && dir.shape.length > 1) {
      var el = document.getElementById("routeMap");
      if (el && !window.MapView.route(el, { route: r, dir: dir })) mapFallback(el);
    }
  }

  function mapFallback(el) {
    var card = el.closest(".map-card");
    if (!card) return;
    card.innerHTML = '<div class="map-fallback">' + U.icon("info") +
      "<span>Harita bu cihazda gösterilemedi. Güzergahı aşağıdaki durak listesinden takip edebilirsin.</span></div>";
  }

  function stat(label, value, sub) {
    return '<div class="stat"><span>' + U.esc(label) + "</span><strong>" + U.esc(value) + "</strong>" +
      (sub ? '<small>' + U.esc(sub) + "</small>" : "") + "</div>";
  }

  function fareCard(route) {
    var fare = D.fareFor(route.mode);
    if (!fare) return "";
    function cell(label, value) {
      return '<div class="fare-cell"><span>' + U.esc(label) + "</span><strong>" +
        (value == null ? "—" : value + " ₺") + "</strong></div>";
    }
    return '<div class="card fare-mini"><div class="card-head"><h3>Ücret</h3><span class="muted">' +
      U.esc(fare.validFrom || "") + '</span></div><div class="fare-cells">' +
      cell("Kart", fare.card) + cell("Öğrenci", fare.student) + cell("Nakit", fare.cash) +
      '</div><p class="hint">' + U.esc(fare.label || "") +
      (fare.cash == null ? " · nakit kabul edilmiyor" : "") +
      (fare.source ? " · Kaynak: " + U.esc(fare.source) : "") + "</p></div>";
  }

  function sourceNote() {
    var meta = D.meta || {};
    var feed = meta.feed || {};
    return '<div class="source">' + U.icon("info") + "<div><strong>Veri kaynağı</strong><span>" +
      U.esc(feed.name || "") + (feed.validUntil ? " · geçerlilik: " + U.esc(feed.validUntil) : "") +
      "</span><span>Resmî uygulama değildir; sefer saatleri değişebilir.</span></div></div>";
  }

  function renderStop(route) {
    var stop = D.stop(route.id);
    if (!stop) { renderNotFound("Durak bulunamadı"); return; }
    state.current = { type: "stop", id: route.id };
    addRecent("stop", route.id);

    var groups = D.routesAt(route.id);
    var nearby = D.nearbyStops(stop[1], stop[2], 7, 700).filter(function (s) { return s.id !== route.id; });

    setHeader({
      back: true,
      title: stop[0],
      sub: stop[3] === 1 ? "Metro istasyonu" : "Durak",
      action: { type: "stop", id: route.id, active: isFav("stop", route.id) }
    });
    showTabbar(false);

    var body = '<div class="stop-hero">' + U.icon(stop[3] === 1 ? "metro" : "pin", "stop-hero-icon") +
      "<h2>" + U.esc(stop[0]) + "</h2><p>" + groups.length + " hat geçiyor</p></div>";

    body += '<div class="card map-card"><div class="map-toolbar"><h3>Konum</h3>' +
      '<button class="map-toggle" data-action="tiles">Sokak haritası</button></div>' +
      '<div id="stopMap" class="map map-sm" role="img" aria-label="' +
      U.esc(stop[0]) + ' konum haritası"></div></div>';

    body += '<div class="card"><div class="card-head"><h3>Bu duraktan geçen hatlar</h3></div>' +
      '<div class="line-groups">' + groups.map(function (group) {
        return '<div class="line-group"><a class="line-head" href="#/route/' + encodeURIComponent(group.route.id) + '">' +
          U.badge(group.route) + '<span class="lm"><strong>' + U.esc(group.route.name) + "</strong><small>" +
          U.esc(group.route.operator) + "</small></span></a><div class=\"dir-chips\">" +
          group.dirs.map(function (line) {
            return '<a class="dir-chip" href="#/route/' + encodeURIComponent(group.route.id) + "/" + line.dir.d + '">' +
              U.icon("transfer", "ic-xs") + U.esc(line.dir.heads) + "</a>";
          }).join("") + "</div></div>";
      }).join("") + "</div></div>";

    body += '<button class="btn primary wide" data-action="plan-from" data-id="' + U.esc(route.id) + '">' +
      U.icon("plan") + " Buradan yolculuk planla</button>";
    body += '<button class="btn ghost wide" data-action="share" data-type="stop" data-id="' +
      U.esc(route.id) + '">' + U.icon("transfer") + " Durağı paylaş</button>";

    if (nearby.length) {
      body += '<section class="block"><div class="block-head"><h3>Yakın duraklar</h3></div><div class="stop-list">' +
        nearby.map(function (s) { return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length }); }).join("") + "</div></section>";
    }

    view.innerHTML = '<div class="page detail-page">' + body + "</div>";
    var el = document.getElementById("stopMap");
    if (el && !window.MapView.stop(el, { stop: stop, nearby: nearby })) mapFallback(el);
  }

  function renderFavorites() {
    setHeader({ title: "Favoriler", sub: "Kaydedilen hatlar ve duraklar", back: false });
    showTabbar(true);
    setTab("favorites");

    var f = favs();
    var routes = f.routes.map(function (id) { return D.route(id); }).filter(Boolean);
    var stops = f.stops.map(function (id) {
      var s = D.stop(id);
      return s ? { id: id, name: s[0], kind: s[3] } : null;
    }).filter(Boolean);

    if (!routes.length && !stops.length) {
      view.innerHTML = '<div class="page"><div class="empty big">' + U.icon("star") +
        "<strong>Henüz favori yok</strong><span>Hat veya durak detayındaki yıldıza dokunarak buraya ekle.</span></div></div>";
      return;
    }

    var html = '<div class="page">';
    if (routes.length) {
      html += '<section class="block"><div class="block-head"><h3>Hatlar</h3><span class="muted">' + routes.length + "</span></div>" +
        '<div class="route-list">' + routes.map(U.routeCard).join("") + "</div></section>";
    }
    if (stops.length) {
      html += '<section class="block"><div class="block-head"><h3>Duraklar</h3><span class="muted">' + stops.length + "</span></div>" +
        '<div class="stop-list">' + stops.map(function (s) { return U.stopRow(s, {}); }).join("") + "</div></section>";
    }
    html += '<button class="btn ghost wide" data-action="clear-favs">Favorileri temizle</button></div>';
    view.innerHTML = html;
  }

  function fareCell(value) {
    return value == null ? "—" : value + " ₺";
  }

  function renderInfo() {
    setHeader({ title: "Bilgi", sub: "Veri, ücretler ve kaynaklar", back: false });
    showTabbar(true);
    setTab("info");

    var meta = D.meta || {};
    var c = meta.counts || {};
    var fares = meta.fares || [];
    var feed = meta.feed || {};

    var html = '<div class="page info">' +
      '<div class="card appcard"><div class="applogo">' + U.icon("bus") + "</div>" +
      "<div><h2>Adana Hat Rehberi</h2><p>" + counts() + "</p></div></div>";

    html += freshnessBanner();

    html += '<section class="info-section"><h3>Veri kapsamı</h3><div class="card">' +
      kv("Otobüs hattı", (c.bus || 0) + " hat") +
      kv("Dolmuş / minibüs", (c.minibus || 0) + " hat") +
      kv("Metro", "M1 · " + (c.metros || 0) + " istasyon") +
      kv("Durak", (c.stops || 0) + " durak") +
      kv("Yön / varyant", (c.directions || 0)) +
      (c.limited ? kv("Sınırlı veri", c.limited + " hat (yalnız yön)") : "") +
      (c.partial ? kv("Kısmi veri", c.partial + " hat (yaklaşık süre)") : "") +
      (feed.validFrom ? kv("Tarife geçerliliği", feed.validFrom + " → " + feed.validUntil) : "") +
      "</div></section>";

    html += '<section class="info-section"><h3>Ücretler</h3><div class="card fare-wrap"><table class="fare-table">' +
      "<thead><tr><th>Mod</th><th>Kart</th><th>Öğrenci</th><th>Nakit</th></tr></thead><tbody>" +
      fares.map(function (f) {
        return "<tr><td><strong>" + U.esc(f.label) + "</strong><small>" + U.esc(f.validFrom || "") +
          "</small></td><td>" + fareCell(f.card) + "</td><td>" + fareCell(f.student) + "</td><td>" + fareCell(f.cash) + "</td></tr>";
      }).join("") + "</tbody></table><p class=\"hint\">" +
      U.esc(meta.faresNote || "Ücretler bilgi amaçlıdır; güncel tarife UKOME tarafından belirlenir.") + "</p></div></section>";

    var allAnn = D.activeAnnouncements();
    if (allAnn.length) {
      html += '<section class="info-section"><h3>Duyurular</h3><div class="announce-list">' +
        allAnn.map(announceCard).join("") + "</div></section>";
    }

    html += '<section class="info-section"><h3>Kaynaklar</h3><div class="card source-list">' +
      (meta.sources || []).map(function (s) { return "<p>" + U.icon("info", "ic-xs") + U.esc(s) + "</p>"; }).join("") +
      "</div></section>";

    html += '<section class="info-section"><h3>Yasal not</h3><div class="card"><p class="legal">' +
      U.esc(meta.disclaimer || "") + "</p>" +
      (meta.limitedNote ? '<p class="legal">' + U.esc(meta.limitedNote) + "</p>" : "") +
      '<a class="btn ghost wide" href="https://ulasimbilgi.adana.bel.tr/" target="_blank" rel="noopener">Resmî Adana Ulaşım sitesi</a>' +
      '<a class="btn ghost wide" href="https://github.com/wendigo0ooo/adana-hat-rehberi/blob/main/docs/gizlilik.md" target="_blank" rel="noopener">Gizlilik politikası</a>' +
      '<a class="btn ghost wide" href="https://github.com/wendigo0ooo/adana-hat-rehberi/issues/new?template=hat-durak-saati.md" target="_blank" rel="noopener">Hata bildir</a>' +
      '<a class="btn ghost wide" href="https://github.com/wendigo0ooo/adana-hat-rehberi/issues/new?template=oneri.md" target="_blank" rel="noopener">Öneri gönder</a>' +
      "</div></section>";

    var version = "1.0";
    if (window.AndroidBridge && window.AndroidBridge.appVersion) {
      try { version = window.AndroidBridge.appVersion(); } catch (e) {}
    }
    html += '<p class="version">Sürüm ' + U.esc(version) + " · Veri: " + U.esc(meta.generated || "") + "</p></div>";
    view.innerHTML = html;
  }

  function kv(label, value) {
    return '<div class="kv"><span>' + U.esc(label) + "</span><strong>" + U.esc(value) + "</strong></div>";
  }

  function renderNotFound(message) {
    setHeader({ back: true, title: "Bulunamadı", sub: "" });
    showTabbar(false);
    view.innerHTML = '<div class="page"><div class="empty big">' + U.icon("info") +
      "<strong>" + U.esc(message) + "</strong><span>Bağlantı eski olabilir. Ana sayfaya dönüp yeniden arayın.</span>" +
      '<a class="btn primary" href="#/">Ana sayfa</a></div></div>';
  }

  var suggestLater = U.debounce(function (input) {
    var field = input.dataset.ac;
    var box = document.getElementById(field + "Sug");
    if (!box) return;
    var q = input.value.trim();
    if (q.length < 2) {
      box.hidden = true;
      box.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      return;
    }
    var stops = D.searchStops(q, 8);
    box.innerHTML = stops.length ? stops.map(function (s) {
      var codes = stopCodes(s.id, 4);
      var meta = codes.length ? codes.join(" · ") : ((D.linesAt(s.id) || []).length + " hat");
      return '<button class="sug-item" data-action="pick-stop" data-field="' + field + '" data-id="' +
        U.esc(s.id) + '" role="option" aria-selected="false"><span class="sug-name">' + U.esc(s.name) + '</span><span class="sug-meta">' +
        U.esc(meta) + (s.kind === 1 ? " · metro" : "") + "</span></button>";
    }).join("") : '<div class="sug-empty">Durak bulunamadı</div>';
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }, 110);

  view.addEventListener("input", function (e) {
    if (e.target.id === "searchInput") {
      state.query = e.target.value;
      scheduleHomeResults();
      return;
    }
    if (e.target.dataset && e.target.dataset.ac) suggestLater(e.target);
  });

  view.addEventListener("keydown", function (e) {
    if (e.target.dataset && e.target.dataset.ac) {
      var box = document.getElementById(e.target.dataset.ac + "Sug");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!box || box.hidden) return;
        var items = box.querySelectorAll(".sug-item");
        if (!items.length) return;
        var at = Array.prototype.indexOf.call(items, document.activeElement);
        var next = e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1);
        items[next].focus();
        return;
      }
      if (e.key === "Escape") {
        if (box) box.hidden = true;
        e.target.setAttribute("aria-expanded", "false");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        var first = box && !box.hidden ? box.querySelector(".sug-item") : null;
        if (first) first.click();
        return;
      }
      return;
    }
    if (e.key !== "Enter") return;
    if (e.target.id === "searchInput") {
      var routes = D.searchRoutes(state.query, state.mode, 2);
      if (routes.length === 1) go("#/route/" + encodeURIComponent(routes[0].id));
    }
  });

  view.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === "mode") {
      e.preventDefault();
      state.mode = btn.dataset.mode;
      renderHome(true);
    } else if (action === "clear-search") {
      e.preventDefault();
      state.query = "";
      var input = document.getElementById("searchInput");
      if (input) { input.value = ""; input.focus(); }
      updateHomeResults();
    } else if (action === "search-op") {
      e.preventDefault();
      state.query = btn.dataset.q;
      renderHome(true);
    } else if (action === "locate") {
      e.preventDefault();
      locate("home");
    } else if (action === "plan-locate") {
      e.preventDefault();
      locate("plan");
    } else if (action === "pick-stop") {
      e.preventDefault();
      var field = btn.dataset.field;
      var id = btn.dataset.id;
      state.plan[field] = { id: id, name: D.stopName(id) };
      if (field === "from") state.plan.walk = null;
      var fieldInput = document.getElementById(field + "Input");
      if (fieldInput) fieldInput.value = D.stopName(id);
      var box = document.getElementById(field + "Sug");
      if (box) box.hidden = true;
      var combo = document.getElementById(field + "Input");
      if (combo) combo.setAttribute("aria-expanded", "false");
    } else if (action === "swap") {
      e.preventDefault();
      var from = state.plan.from;
      state.plan.from = state.plan.to;
      state.plan.to = from;
      state.plan.walk = null;
      var suffix = (state.plan.from && state.plan.to) ?
        "/" + encodeURIComponent(state.plan.from.id) + "/" + encodeURIComponent(state.plan.to.id) : "";
      go("#/plan" + suffix);
    } else if (action === "plan-submit") {
      e.preventDefault();
      if (!state.plan.from || !state.plan.to) { U.toast("Kalkış ve varış durağını seçin"); return; }
      go("#/plan/" + encodeURIComponent(state.plan.from.id) + "/" + encodeURIComponent(state.plan.to.id));
    } else if (action === "day") {
      e.preventDefault();
      state.timeKey = btn.dataset.key;
      var card = document.getElementById("timesCard");
      if (card && state.current && state.current.type === "route") {
        var route = D.route(state.current.id);
        var dir = route.dirs[state.current.dirIndex];
        card.outerHTML = timesCard(route, dir);
        var timeline = document.getElementById("timelineCard");
        if (timeline) timeline.outerHTML = stopsTimeline(dir);
        var statsEl = document.getElementById("statsCard");
        if (statsEl) statsEl.outerHTML = statsCard(route, dir);
      }
    } else if (action === "share") {
      e.preventDefault();
      var text = shareText(btn.dataset.type, btn.dataset.id);
      if (!text) return;
      if (window.AndroidBridge && window.AndroidBridge.share) {
        try { window.AndroidBridge.share(text); return; } catch (err) {}
      }
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
        return;
      }
      U.toast("Bu cihazda paylaşım desteklenmiyor");
    } else if (action === "tiles") {
      e.preventDefault();
      window.MapView.toggleTiles(btn);
    } else if (action === "plan-from") {
      e.preventDefault();
      var sid = btn.dataset.id;
      state.plan.from = { id: sid, name: D.stopName(sid) };
      state.plan.to = null;
      go("#/plan");
    } else if (action === "toggle-fav") {
      e.preventDefault();
      toggleFav(btn.dataset.type, btn.dataset.id);
    } else if (action === "clear-favs") {
      e.preventDefault();
      U.safeSet(FAV_KEY, { routes: [], stops: [] });
      renderFavorites();
      U.toast("Favoriler temizlendi");
    }
  });

  backBtn.addEventListener("click", function () {
    if (history.length > 1) history.back(); else go("#/");
  });

  topAction.addEventListener("click", function () {
    var type = topAction.dataset.type;
    var id = topAction.dataset.id;
    if (type && id) toggleFav(type, id);
  });

  window.onNativeLocation = function (lat, lon) {
    state.locating = false;
    stopLocateTimer();
    var target = state.locateTarget;
    state.locateTarget = null;
    if (target === "plan") {
      setPlanFromFix(Number(lat), Number(lon));
      return;
    }
    showNearby(Number(lat), Number(lon));
  };
  window.onNativeLocationError = function (message) {
    locateFailed(message);
  };

  window.App = {
    openStop: function (sid) { go("#/stop/" + encodeURIComponent(sid)); },
    openRoute: function (id, dir) { go("#/route/" + encodeURIComponent(id) + "/" + (dir == null ? 0 : dir)); }
  };

  window.addEventListener("hashchange", render);
  render();
})();
