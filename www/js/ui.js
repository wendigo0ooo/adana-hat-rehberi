(function (global) {
  "use strict";

  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    star: '<path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.3-.9z"/>',
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/>',
    plan: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H9a3 3 0 0 0-3 3v.5"/>',
    swap: '<path d="M7 4v14"/><path d="m3 8 4-4 4 4"/><path d="M17 20V6"/><path d="m13 16 4 4 4-4"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><circle cx="12" cy="12" r="8"/>',
    bus: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 10h16"/><path d="M8 17v3"/><path d="M16 17v3"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
    minibus: '<rect x="4" y="6" width="16" height="11" rx="3"/><path d="M4 11h16"/><path d="M8 17v2"/><path d="M16 17v2"/><path d="M8 8h3"/>',
    metro: '<rect x="6" y="3" width="12" height="14" rx="4"/><path d="M6 11h12"/><path d="m8 21 2-4"/><path d="m16 21-2-4"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    transfer: '<path d="M4 7h11"/><path d="m12 4 3 3-3 3"/><path d="M20 17H9"/><path d="m12 14-3 3 3 3"/>',
    pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 14h2"/>'
  };

  var MODE_COLOR = { bus: "bus", minibus: "minibus", metro: "metro" };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || "") + "</svg>";
  }

  function modeLabel(mode) {
    return mode === "minibus" ? "Dolmuş" : (mode === "metro" ? "Metro" : "Otobüs");
  }

  function badge(route, extraClass) {
    var mode = MODE_COLOR[route.mode] || "bus";
    return '<span class="code code-' + mode + " " + (extraClass || "") + '">' + esc(route.code) + "</span>";
  }

  function modePill(mode) {
    var key = MODE_COLOR[mode] || "bus";
    return '<span class="pill pill-' + key + '">' + icon(mode, "ic-xs") + modeLabel(mode) + "</span>";
  }

  function routeMeta(route) {
    if (route.limited) return "Yön bilgisi var · sefer/durak verisi yok";
    var dir = route.dirs[0];
    var count = dir ? dir.stops.length : 0;
    return modeLabel(route.mode) + " · " + count + " durak · " +
      (route.dirs.length > 1 ? "çift yön" : "tek yön") + (route.partial ? " · kısmi" : "");
  }

  function routeCard(route) {
    return '<a class="route-card" href="#/route/' + encodeURIComponent(route.id) + '">' +
      badge(route) +
      '<div class="rc-main"><strong>' + esc(route.name) + "</strong><small>" + esc(routeMeta(route)) + "</small></div>" +
      (route.limited ? '<span class="tag tag-limited">Sınırlı</span>' :
        (route.partial ? '<span class="tag tag-limited">Kısmi</span>' : "")) +
      icon("chevron", "chev") +
      "</a>";
  }

  function stopRow(stop, opts) {
    opts = opts || {};
    var sub = [];
    if (opts.codes && opts.codes.length) sub.push(opts.codes.join(" · "));
    else if (opts.lines != null) sub.push(opts.lines + " hat");
    if (stop.dist != null) sub.push(formatDistance(stop.dist));
    if (stop.same > 1) sub.push(stop.same + " aynı adlı durak");
    if (stop.kind === 1) sub.push("Metro istasyonu");
    return '<a class="stop-row" href="#/stop/' + encodeURIComponent(stop.id) + '">' +
      '<span class="stop-icon">' + icon(stop.kind === 1 ? "metro" : "pin") + "</span>" +
      '<span class="sr-main"><strong>' + esc(stop.name) + "</strong><small>" + esc(sub.join(" · ")) + "</small></span>" +
      icon("chevron", "chev") + "</a>";
  }

  function arrivalClock(mins) {
    var now = global.AdanaTime.now();
    var total = now.getHours() * 60 + now.getMinutes() + (mins || 0);
    return global.AdanaTime.displayTime(global.AdanaTime.timeOf(total));
  }

  function stopLink(id, name) {
    return '<a class="stop-link" href="#/stop/' + encodeURIComponent(id) + '">' + esc(name) + "</a>";
  }

  function journeyDirect(item) {
    var route = item.route;
    var fromId = item.dir.stops[item.fromIdx];
    var toId = item.dir.stops[item.toIdx];
    return '<div class="journey">' +
      '<div class="j-time"><strong>' + item.mins + '</strong><span>dk</span></div>' +
      '<div class="j-body">' +
      '<div class="leg">' + badge(route) + '<div class="leg-main"><strong>' + esc(route.name) + "</strong><small>" +
      "Yön: " + esc(item.dir.heads) + "</small></div></div>" +
      '<div class="j-meta">' + icon("pin", "ic-xs") + " Bin: " + stopLink(fromId, global.AdanaData.stopName(fromId)) +
      " · İn: " + stopLink(toId, global.AdanaData.stopName(toId)) +
      (item.toWalk ? " · ~" + item.toWalk + " m yürü" : "") +
      " · " + item.stops + " durak · ~" + item.wait + " dk bekleme" +
      " · ≈ varış " + arrivalClock(item.mins + item.wait) + "</div>" +
      "</div></div>";
  }

  function journeyTransfer(item) {
    var fromId = item.first.dir.stops[item.first.fromIdx];
    var alightId = item.transfer;
    var boardId = item.board || item.transfer;
    var toId = item.second.dir.stops[item.second.toIdx];
    var fromName = global.AdanaData.stopName(fromId);
    var alightName = global.AdanaData.stopName(alightId);
    var boardName = global.AdanaData.stopName(boardId);
    var toName = global.AdanaData.stopName(toId);
    var walking = boardId !== alightId
      ? "İn: " + stopLink(alightId, alightName) + " · ~" + (item.walk || 0) + " m yürü · Bin: " + stopLink(boardId, boardName)
      : "Aktarma: " + stopLink(alightId, alightName) + " · burada inip diğer araca bin";
    return '<div class="journey journey-transfer">' +
      '<div class="j-time"><strong>' + item.mins + '</strong><span>dk</span></div>' +
      '<div class="j-body">' +
      '<div class="leg">' + badge(item.first.route) + '<div class="leg-main"><strong>' + esc(item.first.route.name) +
      "</strong><small>Yön: " + esc(item.first.dir.heads) + "</small></div></div>" +
      '<div class="j-meta">' + icon("pin", "ic-xs") + " Bin: " + stopLink(fromId, fromName) +
      " → İn: " + stopLink(alightId, alightName) + "</div>" +
      '<div class="transfer-line">' + icon("transfer", "ic-xs") + " " + walking + "</div>" +
      '<div class="leg">' + badge(item.second.route) + '<div class="leg-main"><strong>' + esc(item.second.route.name) +
      "</strong><small>Yön: " + esc(item.second.dir.heads) + "</small></div></div>" +
      '<div class="j-meta">' + icon("pin", "ic-xs") + " Bin: " + stopLink(boardId, boardName) +
      " → İn: " + stopLink(toId, toName) +
      (item.second.toWalk ? " · ~" + item.second.toWalk + " m yürü" : "") +
      " · ≈ varış " + arrivalClock(item.mins) + "</div>" +
      "</div></div>";
  }

  function formatDistance(meters) {
    if (meters == null) return "";
    if (meters < 1000) return Math.round(meters) + " m";
    return (meters / 1000).toFixed(1).replace(".", ",") + " km";
  }

  var listeners = [];
  function on(el, type, fn) {
    el.addEventListener(type, fn);
    listeners.push([el, type, fn]);
  }

  function toast(message, kind) {
    var wrap = document.getElementById("toast");
    if (!wrap) return;
    wrap.textContent = message;
    wrap.className = "toast show" + (kind ? " toast-" + kind : "");
    clearTimeout(wrap._timer);
    wrap._timer = setTimeout(function () { wrap.className = "toast"; }, 3600);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 120);
    };
  }

  function safeGet(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function safeSet(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  global.UI = {
    esc: esc,
    icon: icon,
    badge: badge,
    modeLabel: modeLabel,
    modePill: modePill,
    routeCard: routeCard,
    routeMeta: routeMeta,
    stopRow: stopRow,
    journeyDirect: journeyDirect,
    journeyTransfer: journeyTransfer,
    formatDistance: formatDistance,
    toast: toast,
    debounce: debounce,
    safeGet: safeGet,
    safeSet: safeSet,
    on: on
  };
})(typeof window !== "undefined" ? window : globalThis);
