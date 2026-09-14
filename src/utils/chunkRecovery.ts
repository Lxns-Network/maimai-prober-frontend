/**
 * Inlined into the prerendered <head> (+Head.tsx), ahead of every module chunk,
 * so it still works when the page entry chunk itself fails after a deploy.
 *
 * Recovery is reload-only: at most 2 attempts per 20s window (plain reload,
 * then a cache-busting `_r` redirect), tracked in sessionStorage.
 *
 * The `vite:preloadError` default is never prevented: `preventDefault()` makes
 * Vite resolve the failed dynamic import with `undefined`, and consumers of
 * that import (Vike's virtual-module assert, React.lazy) then crash with
 * errors that mask the real chunk failure. The original error must keep
 * propagating; `unhandledrejection` is only suppressed while a recovery
 * reload is already underway.
 */
export const chunkRecoveryScript = `
(function () {
  var KEY = "chunk_reload_log";
  var WINDOW_MS = 20000;
  var MAX_RELOADS = 2;
  var PARAM = "_r";
  var PATTERNS = [
    "Failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "Importing a module script failed",
    "Loading chunk"
  ];

  try {
    if (location.search.indexOf(PARAM + "=") !== -1) {
      var clean = new URL(location.href);
      clean.searchParams.delete(PARAM);
      history.replaceState(history.state, "", clean.toString());
    }
  } catch (e) {}

  var recovering = false;

  function message(reason) {
    if (typeof reason === "string") return reason;
    if (reason && typeof reason.message === "string") return reason.message;
    return "";
  }

  function isChunkError(reason) {
    var m = message(reason);
    if (!m) return false;
    for (var i = 0; i < PATTERNS.length; i++) {
      if (m.indexOf(PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function recover() {
    if (recovering) return true;

    var log = [];
    try {
      var parsed = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      if (Array.isArray(parsed)) {
        log = parsed.filter(function (t) { return typeof t === "number"; });
      }
    } catch (e) {}

    var now = Date.now();
    log = log.filter(function (t) { return now - t < WINDOW_MS; });
    if (log.length >= MAX_RELOADS) return false;

    recovering = true;
    var attempt = log.length;
    log.push(now);
    try { sessionStorage.setItem(KEY, JSON.stringify(log)); } catch (e) {}

    if (attempt === 0) {
      location.reload();
    } else {
      try {
        var url = new URL(location.href);
        url.searchParams.set(PARAM, String(now));
        location.replace(url.toString());
      } catch (e) {
        location.reload();
      }
    }
    return true;
  }

  window.addEventListener("vite:preloadError", function () {
    recover();
  });
  window.addEventListener("unhandledrejection", function (event) {
    if (isChunkError(event.reason) && recover()) {
      event.preventDefault();
    }
  });
})();
`;
