(function (global) {
  "use strict";

  var COLORS = { bus: "#0284c7", minibus: "#d97706", metro: "#7c3aed" };
  var current = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function isDark() {
    return global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function gridLayer() {
    var dark = isDark();
    var Grid = global.L.GridLayer.extend({
      createTile: function () {
        var size = this.getTileSize();
        var tile = document.createElement("canvas");
        tile.width = size.x;
        tile.height = size.y;
        var ctx = tile.getContext("2d");
        ctx.fillStyle = dark ? "#0f1b24" : "#edf4f8";
        ctx.fillRect(0, 0, size.x, size.y);
        ctx.strokeStyle = dark ? "#1c2c39" : "#dbe8f0";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, size.x - 1, size.y - 1);
        return tile;
      }
    });
    return new Grid();
  }

  function destroy() {
    if (current && current.map) {
      try { current.map.remove(); } catch (e) {}
    }
    current = null;
  }

  function baseMap(el) {
    destroy();
    if (!global.L) return null;
    var map;
    try {
      map = global.L.map(el, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        minZoom: 10,
        maxZoom: 19
      });
      map.attributionControl.setPrefix("");
      gridLayer().addTo(map);
      global.L.control.zoom({ position: "bottomright" }).addTo(map);
      current = { map: map, tiles: null, el: el };
    } catch (e) {
      if (global.console) console.error("Harita başlatılamadı:", e);
      destroy();
      return null;
    }
    var refresh = function () {
      try { map.invalidateSize({ animate: false }); } catch (e) {}
    };
    setTimeout(refresh, 60);
    if (global.requestAnimationFrame) global.requestAnimationFrame(refresh);
    return map;
  }

  var resizeTimer = null;
  function onViewportChange() {
    if (!current || !current.map) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!current || !current.map) return;
      try { current.map.invalidateSize({ animate: false }); } catch (e) {}
    }, 150);
  }
  if (global.addEventListener) {
    global.addEventListener("resize", onViewportChange);
    global.addEventListener("orientationchange", onViewportChange);
  }

  function colorFor(mode) { return COLORS[mode] || COLORS.bus; }

  function route(el, opts) {
    var dir = opts.dir;
    var shape = (dir && dir.shape) || [];
    if (shape.length < 2) return false;
    var map = baseMap(el);
    if (!map) return false;

    var color = colorFor(opts.route.mode);
    global.L.polyline(shape, { color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round" }).addTo(map);
    global.L.polyline(shape, { color: color, weight: 5, opacity: 0.95, lineCap: "round" }).addTo(map);

    var first = dir.stops[0];
    var last = dir.stops[dir.stops.length - 1];
    (dir.stops || []).forEach(function (sid, index) {
      var stop = global.AdanaData.stop(sid);
      if (!stop) return;
      var terminal = index === 0 || index === dir.stops.length - 1;
      var marker = global.L.circleMarker([stop[1], stop[2]], {
        radius: terminal ? 8 : 4.5,
        color: terminal ? color : "#ffffff",
        weight: terminal ? 3 : 1.5,
        fillColor: terminal ? "#ffffff" : color,
        fillOpacity: terminal ? 1 : 0.85
      }).addTo(map);
      marker.bindTooltip((index + 1) + ". " + esc(stop[0]), { direction: "top", offset: [0, -6] });
      marker.on("click", function () {
        if (global.App && App.openStop) App.openStop(sid);
      });
    });

    var bounds = global.L.latLngBounds(shape);
    if (first && global.AdanaData.stop(first)) bounds.extend([global.AdanaData.stop(first)[1], global.AdanaData.stop(first)[2]]);
    if (last && global.AdanaData.stop(last)) bounds.extend([global.AdanaData.stop(last)[1], global.AdanaData.stop(last)[2]]);
    map.fitBounds(bounds, { padding: [26, 26], maxZoom: 16 });
    return true;
  }

  function stop(el, opts) {
    var s = opts.stop;
    if (!s) return false;
    var map = baseMap(el);
    if (!map) return false;
    global.L.circle([s[1], s[2]], {
      radius: 300, color: "#0d9488", weight: 1, opacity: 0.5,
      fillColor: "#0d9488", fillOpacity: 0.08
    }).addTo(map);
    global.L.circleMarker([s[1], s[2]], {
      radius: 9, color: "#0d9488", weight: 3, fillColor: "#ffffff", fillOpacity: 1
    }).addTo(map).bindTooltip(esc(s[0]), { direction: "top", offset: [0, -8] });

    (opts.nearby || []).forEach(function (n) {
      global.L.circleMarker([n.lat, n.lon], {
        radius: 4, color: "#64748b", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1
      }).addTo(map).bindTooltip(esc(n.name) + " · " + Math.round(n.dist) + " m", { direction: "top" });
    });

    map.setView([s[1], s[2]], 16);
    return true;
  }

  function toggleTiles(btn) {
    if (!current || !current.map) return;
    var map = current.map;
    if (current.tiles) {
      map.removeLayer(current.tiles);
      current.tiles = null;
      if (btn) { btn.classList.remove("active"); btn.textContent = "Sokak haritası"; }
      return;
    }
    current.tiles = global.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    current.tiles.bringToBack();
    if (btn) { btn.classList.add("active"); btn.textContent = "Şematik harita"; }
  }

  global.MapView = { route: route, stop: stop, destroy: destroy, toggleTiles: toggleTiles, colorFor: colorFor };
})(typeof window !== "undefined" ? window : globalThis);
