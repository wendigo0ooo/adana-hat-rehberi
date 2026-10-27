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
    plan: { from: null, to: null },
    current: null,
    locating: false
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
      a.classList.toggle("active", a.dataset.tab === tab);
    });
  }

  function showTabbar(show) {
    document.body.classList.toggle("detail", !show);
  }

  function parseHash() {
    var raw = location.hash.replace(/^#/, "") || "/";
    var parts = raw.split("/").filter(function (p) { return p.length; }).map(decodeURIComponent);
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
          return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length });
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
      '<div id="searchResults"></div>' +
      '<div id="homeDefault" class="home-default">' +
      '<section class="block"><div class="block-head"><h3>Yakınımdaki duraklar</h3>' +
      '<button class="btn ghost sm" data-action="locate">' + U.icon("locate") + " Konumumu kullan</button></div>" +
      '<div id="nearbyBox" class="card soft">' + nearbyIntro() + "</div></section>" +
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
    if (focusSearch) {
      var input = document.getElementById("searchInput");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  }

  function showNearby(lat, lon) {
    var box = document.getElementById("nearbyBox");
    if (!box) { U.toast("Konum alındı"); return; }
    if (!isFinite(lat) || !isFinite(lon)) { U.toast("Konum alınamadı", "error"); return; }
    var stops = D.nearbyStops(lat, lon, 10, 2500);
    if (!stops.length) {
      box.innerHTML = '<p class="empty">2,5 km içinde durak bulunamadı.</p>';
      return;
    }
    box.innerHTML = '<p class="nearby-title">En yakın duraklar</p><div class="stop-list">' +
      stops.map(function (s) {
        return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length });
      }).join("") + "</div>";
  }

  function locate() {
    if (state.locating) return;
    state.locating = true;
    var box = document.getElementById("nearbyBox");
    if (box) box.innerHTML = '<div class="loading">' + U.icon("locate") + " Konum alınıyor…</div>";

    if (window.AndroidBridge && window.AndroidBridge.requestLocation) {
      try { window.AndroidBridge.requestLocation(); return; } catch (e) {}
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.locating = false;
        showNearby(pos.coords.latitude, pos.coords.longitude);
      }, function () {
        state.locating = false;
        U.toast("Konum alınamadı. Konum iznini kontrol edin.", "error");
        var b = document.getElementById("nearbyBox");
        if (b) b.innerHTML = nearbyIntro();
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      return;
    }
    state.locating = false;
    U.toast("Bu cihazda konum desteklenmiyor.", "error");
  }

  function planField(field, label, iconName, value, placeholder) {
    return '<div class="field"><label for="' + field + 'Input">' + U.icon(iconName) + label + "</label>" +
      '<div class="ac-wrap"><input id="' + field + 'Input" data-ac="' + field + '" autocomplete="off" ' +
      'placeholder="' + placeholder + '" value="' + U.esc(value || "") + '">' +
      '<div class="suggest" id="' + field + 'Sug" hidden></div></div></div>';
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
    var html = '<div class="plan-summary">' + U.esc(from.name) + " → " + U.esc(to.name) + "</div>";

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
    html += '<p class="hint">Süreler yaklaşık seyahat süresidir; bekleme ve yürüme dahil değildir.</p>';
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
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
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
      '<div class="time-grid">' + (dep.length ? dep.map(function (t, i) {
        return '<span class="time ' + (i === nextIndex ? "next" : "") + '">' + t + "</span>";
      }).join("") : '<p class="empty">Bu gün için sefer bilgisi yok.</p>') + "</div>" +
      '<p class="hint">Saatler hattın ilk durağından kalkış saatleridir. Sonraki duraklar için aşağıdaki süreleri ekleyin.</p></div>';
  }

  function stopsTimeline(dir) {
    var key = state.timeKey || D.todayKey();
    var dep = D.departures(dir, key);
    if (!dep.length) dep = D.departures(dir, "wd");
    var first = dep.length ? dep[0] : null;
    var lastIndex = dir.stops.length - 1;

    return '<div class="card"><div class="card-head"><h3>Duraklar</h3><span class="muted">' +
      dir.stops.length + " durak</span></div><ol class=\"stop-timeline\">" +
      dir.stops.map(function (sid, i) {
        var stop = D.stop(sid);
        var name = stop ? stop[0] : "Durak";
        var time = D.arrivalAt(dir, i, first);
        var terminal = i === 0 || i === lastIndex;
        return "<li><a href=\"#/stop/" + encodeURIComponent(sid) + "\">" +
          '<span class="rail"><span class="dot' + (terminal ? " terminal" : "") + '"></span></span>' +
          '<span class="seq">' + (i + 1) + "</span>" +
          '<span class="sname">' + U.esc(name) + "</span>" +
          '<span class="stime">' + (time || "") + "</span></a></li>";
      }).join("") + "</ol></div>";
  }

  function routeHero(route) {
    return '<div class="route-hero m-' + route.mode + '">' +
      '<div class="hero-line">' + U.badge(route, "lg") + U.modePill(route.mode) +
      (route.limited ? '<span class="tag tag-limited">Sınırlı veri</span>' : "") + "</div>" +
      "<h2>" + U.esc(route.name) + "</h2>" +
      '<p class="operator">' + U.esc(route.operator) + "</p></div>";
  }

  function renderRoute(route) {
    var r = D.route(route.id);
    if (!r) { renderNotFound("Hat bulunamadı"); return; }

    var dirIndex = 0;
    if (route.d != null) {
      for (var i = 0; i < r.dirs.length; i++) if (r.dirs[i].d === route.d) dirIndex = i;
    }
    var dir = r.dirs[dirIndex];
    state.current = { type: "route", id: r.id, dirIndex: dirIndex };
    addRecent("route", r.id);

    setHeader({
      back: true,
      title: r.code + " · " + r.name,
      sub: U.modeLabel(r.mode) + (r.limited ? " · sınırlı veri" : ""),
      action: { type: "route", id: r.id, active: isFav("route", r.id) }
    });
    showTabbar(false);

    var stats = dir ? D.stats(r, dir) : null;
    var body = routeHero(r);

    if (r.dirs.length > 1) {
      body += '<div class="segmented">' + r.dirs.map(function (d, idx) {
        return '<a class="seg ' + (idx === dirIndex ? "active" : "") + '" href="#/route/' +
          encodeURIComponent(r.id) + "/" + d.d + '">' + U.esc(d.heads) + "</a>";
      }).join("") + "</div>";
    } else if (dir && dir.heads) {
      body += '<div class="single-dir">' + U.icon("transfer") + U.esc(dir.heads) + "</div>";
    }

    if (r.limited) {
      body += '<div class="notice">' + U.icon("info") +
        "<div><strong>Bu hat için detay verisi yok</strong><span>Resmî listede hat ve yön bilgisi var; durak ve sefer saatleri yayımlanmamış. Güncel bilgi için resmî kanalları kontrol edin.</span></div></div>" +
        '<div class="card"><div class="card-head"><h3>Yönler</h3></div><div class="dir-list">' +
        r.dirs.map(function (d) { return '<div class="dir-item">' + U.icon("transfer") + U.esc(d.heads) + "</div>"; }).join("") +
        "</div></div>" +
        '<a class="btn ghost" href="https://ulasimbilgi.adana.bel.tr/Otobusler" target="_blank" rel="noopener">Resmî sitede kontrol et</a>' +
        sourceNote();
      view.innerHTML = '<div class="page detail-page">' + body + "</div>";
      return;
    }

    if (stats) {
      body += '<div class="card stats-grid">' +
        stat("İlk sefer", stats.first || "—", D.dayLabel(stats.dayKey)) +
        stat("Son sefer", stats.last || "—", D.dayLabel(stats.dayKey)) +
        stat("Sıklık", stats.headway ? "~" + stats.headway + " dk" : "—", "hafta içi") +
        stat("Süre", stats.duration != null ? "~" + stats.duration + " dk" : "—", stats.km ? stats.km + " km" : "") +
        "</div>";
    }

    if (dir && dir.shape && dir.shape.length > 1) {
      body += '<div class="card map-card"><div class="map-toolbar"><h3>Güzergah</h3>' +
        '<button class="map-toggle" data-action="tiles">Sokak haritası</button></div>' +
        '<div id="routeMap" class="map"></div></div>';
    }

    if (dir && dir.stops.length) {
      body += timesCard(r, dir);
      body += stopsTimeline(dir);
    }

    body += sourceNote();
    view.innerHTML = '<div class="page detail-page">' + body + "</div>";

    if (dir && dir.shape && dir.shape.length > 1) {
      var el = document.getElementById("routeMap");
      if (el) window.MapView.route(el, { route: r, dir: dir });
    }
  }

  function stat(label, value, sub) {
    return '<div class="stat"><span>' + U.esc(label) + "</span><strong>" + U.esc(value) + "</strong>" +
      (sub ? '<small>' + U.esc(sub) + "</small>" : "") + "</div>";
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
      '<div id="stopMap" class="map map-sm"></div></div>';

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

    if (nearby.length) {
      body += '<section class="block"><div class="block-head"><h3>Yakın duraklar</h3></div><div class="stop-list">' +
        nearby.map(function (s) { return U.stopRow(s, { lines: (D.linesAt(s.id) || []).length }); }).join("") + "</div></section>";
    }

    view.innerHTML = '<div class="page detail-page">' + body + "</div>";
    var el = document.getElementById("stopMap");
    if (el) window.MapView.stop(el, { stop: stop, nearby: nearby });
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
    var expired = feed.validUntil && new Date(feed.validUntil + "T23:59:59") < new Date();

    var html = '<div class="page info">' +
      '<div class="card appcard"><div class="applogo">' + U.icon("bus") + "</div>" +
      "<div><h2>Adana Hat Rehberi</h2><p>" + counts() + "</p></div></div>";

    if (expired) {
      html += '<div class="notice warn">' + U.icon("info") +
        "<div><strong>Veri güncelliği</strong><span>Bu sürümdeki tarife " + U.esc(feed.validUntil) +
        " tarihine kadar geçerliydi. Güncel seferler için resmî kanalları kontrol edin.</span></div></div>";
    }

    html += '<section class="info-section"><h3>Veri kapsamı</h3><div class="card">' +
      kv("Otobüs hattı", (c.bus || 0) + " hat") +
      kv("Dolmuş / minibüs", (c.minibus || 0) + " hat") +
      kv("Metro", "M1 · " + (c.metros || 0) + " istasyon") +
      kv("Durak", (c.stops || 0) + " durak") +
      kv("Yön / varyant", (c.directions || 0)) +
      (c.limited ? kv("Sınırlı veri", c.limited + " hat (yalnız yön)") : "") +
      (feed.validFrom ? kv("Tarife geçerliliği", feed.validFrom + " → " + feed.validUntil) : "") +
      "</div></section>";

    html += '<section class="info-section"><h3>Ücretler</h3><div class="card fare-wrap"><table class="fare-table">' +
      "<thead><tr><th>Mod</th><th>Kart</th><th>Öğrenci</th><th>Nakit</th></tr></thead><tbody>" +
      fares.map(function (f) {
        return "<tr><td><strong>" + U.esc(f.label) + "</strong><small>" + U.esc(f.validFrom || "") +
          "</small></td><td>" + fareCell(f.card) + "</td><td>" + fareCell(f.student) + "</td><td>" + fareCell(f.cash) + "</td></tr>";
      }).join("") + "</tbody></table><p class=\"hint\">" +
      U.esc(meta.faresNote || "Ücretler bilgi amaçlıdır; güncel tarife UKOME tarafından belirlenir.") + "</p></div></section>";

    html += '<section class="info-section"><h3>Kaynaklar</h3><div class="card source-list">' +
      (meta.sources || []).map(function (s) { return "<p>" + U.icon("info", "ic-xs") + U.esc(s) + "</p>"; }).join("") +
      "</div></section>";

    html += '<section class="info-section"><h3>Yasal not</h3><div class="card"><p class="legal">' +
      U.esc(meta.disclaimer || "") + "</p>" +
      (meta.limitedNote ? '<p class="legal">' + U.esc(meta.limitedNote) + "</p>" : "") +
      '<a class="btn ghost wide" href="https://ulasimbilgi.adana.bel.tr/" target="_blank" rel="noopener">Resmî Adana Ulaşım sitesi</a>' +
      "</div></section>";

    html += '<p class="version">Sürüm 1.0 · Veri: ' + U.esc(meta.generated || "") + "</p></div>";
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
    if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    var stops = D.searchStops(q, 8);
    box.innerHTML = stops.length ? stops.map(function (s) {
      return '<button class="sug-item" data-action="pick-stop" data-field="' + field + '" data-id="' +
        U.esc(s.id) + '"><span class="sug-name">' + U.esc(s.name) + '</span><span class="sug-meta">' +
        (D.linesAt(s.id) || []).length + " hat" + (s.kind === 1 ? " · metro" : "") + "</span></button>";
    }).join("") : '<div class="sug-empty">Durak bulunamadı</div>';
    box.hidden = false;
  }, 110);

  view.addEventListener("input", function (e) {
    if (e.target.id === "searchInput") {
      state.query = e.target.value;
      updateHomeResults();
      return;
    }
    if (e.target.dataset && e.target.dataset.ac) suggestLater(e.target);
  });

  view.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    if (e.target.id === "searchInput") {
      var routes = D.searchRoutes(state.query, state.mode, 2);
      if (routes.length === 1) go("#/route/" + encodeURIComponent(routes[0].id));
    }
    if (e.target.dataset && e.target.dataset.ac) e.preventDefault();
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
      locate();
    } else if (action === "pick-stop") {
      e.preventDefault();
      var field = btn.dataset.field;
      var id = btn.dataset.id;
      state.plan[field] = { id: id, name: D.stopName(id) };
      var fieldInput = document.getElementById(field + "Input");
      if (fieldInput) fieldInput.value = D.stopName(id);
      var box = document.getElementById(field + "Sug");
      if (box) box.hidden = true;
    } else if (action === "swap") {
      e.preventDefault();
      var from = state.plan.from;
      state.plan.from = state.plan.to;
      state.plan.to = from;
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
      }
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
    showNearby(Number(lat), Number(lon));
  };
  window.onNativeLocationError = function (message) {
    state.locating = false;
    U.toast(message || "Konum alınamadı. Konum iznini kontrol edin.", "error");
    var box = document.getElementById("nearbyBox");
    if (box) box.innerHTML = nearbyIntro();
  };

  window.App = {
    openStop: function (sid) { go("#/stop/" + encodeURIComponent(sid)); },
    openRoute: function (id, dir) { go("#/route/" + encodeURIComponent(id) + "/" + (dir == null ? 0 : dir)); }
  };

  window.addEventListener("hashchange", render);
  render();
})();
