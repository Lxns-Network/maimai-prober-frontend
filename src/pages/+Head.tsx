import { ColorSchemeScript } from "@mantine/core";
import { UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID } from "../main.ts";

const chunkRecoveryScript = `
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
    var log = [];
    try {
      var parsed = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      if (Array.isArray(parsed)) {
        log = parsed.filter(function (t) { return typeof t === "number"; });
      }
    } catch (e) {}

    var now = Date.now();
    log = log.filter(function (t) { return now - t < WINDOW_MS; });
    if (log.length >= MAX_RELOADS) return;

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
  }

  window.addEventListener("vite:preloadError", function (event) {
    event.preventDefault();
    recover();
  });
  window.addEventListener("unhandledrejection", function (event) {
    if (isChunkError(event.reason)) {
      event.preventDefault();
      recover();
    }
  });
})();
`;

export default function Head() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      {UMAMI_SCRIPT_URL && UMAMI_WEBSITE_ID && (
        <script defer src={UMAMI_SCRIPT_URL} data-website-id={UMAMI_WEBSITE_ID} />
      )}
      <ColorSchemeScript defaultColorScheme="auto" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />

      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="maimai DX 查分器" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
