import { ColorSchemeScript } from "@mantine/core";
import { UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID } from "@/main";
import { chunkRecoveryScript } from "@/utils/chunkRecovery";

const SITE_NAME = "maimai DX 查分器";
const SITE_LOGO_URL = "https://maimai.lxns.net/logo.webp";

// Inline and ahead of the module imports: vike's client router, web-vitals and ts-pattern all
// call these unguarded, and Safari only has them from 15.4.
const polyfillScript = `
(function () {
  function at(n) {
    var len = this.length;
    n = Math.trunc(n) || 0;
    if (n < 0) n += len;
    if (n < 0 || n >= len) return undefined;
    return this[n];
  }

  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, "at", { value: at, writable: true, configurable: true });
  }

  if (!String.prototype.at) {
    Object.defineProperty(String.prototype, "at", { value: at, writable: true, configurable: true });
  }

  if (!Object.hasOwn) {
    Object.defineProperty(Object, "hasOwn", {
      value: function (target, key) {
        if (target === null || target === undefined) {
          throw new TypeError("Cannot convert undefined or null to object");
        }
        return Object.prototype.hasOwnProperty.call(Object(target), key);
      },
      writable: true,
      configurable: true
    });
  }
})();
`;

export default function Head() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: polyfillScript }} />
      <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      {UMAMI_SCRIPT_URL && UMAMI_WEBSITE_ID && (
        <script defer src={UMAMI_SCRIPT_URL} data-website-id={UMAMI_WEBSITE_ID} />
      )}
      <ColorSchemeScript defaultColorScheme="auto" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" href="/favicon.webp" type="image/webp" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="image_src" href={SITE_LOGO_URL} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="zh_CN" />
      <meta property="og:image" content={SITE_LOGO_URL} />
      <meta property="og:image:type" content="image/webp" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="735" />
      <meta property="og:image:alt" content="落雪咖啡屋 maimai DX 查分器" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={SITE_LOGO_URL} />
      <meta name="twitter:image:alt" content="落雪咖啡屋 maimai DX 查分器" />

      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="maimai DX 查分器" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
