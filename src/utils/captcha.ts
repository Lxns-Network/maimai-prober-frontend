import type { Cap as CapType } from "@cap.js/widget";
import { CAPTCHA_ENDPOINT } from "@/main";

const CAP_WIDGET_URL = "https://cap.lxns.net/assets/widget.js";
const CAP_WASM_URL = "https://cap.lxns.net/assets/cap_wasm.js";
const CAP_SOLVE_TIMEOUT = 30000;

let scriptPromise: Promise<void> | null = null;

function loadCapScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.Cap) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = CAP_WIDGET_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Cap widget from ${CAP_WIDGET_URL}`));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function checkWasmAccessible(): Promise<void> {
  try {
    const res = await fetch(CAP_WASM_URL, { method: "HEAD" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`Failed to access Cap WASM at ${CAP_WASM_URL}:`, err);
    throw new Error(`人机验证资源获取失败`);
  }
}

export async function solveCaptcha(): Promise<string> {
  window.CAP_CUSTOM_WASM_URL = CAP_WASM_URL;
  await Promise.all([loadCapScript(), checkWasmAccessible()]);
  const Cap = window.Cap as typeof CapType;
  const cap = new Cap({ apiEndpoint: CAPTCHA_ENDPOINT });

  try {
    const result = await Promise.race([
      cap.solve(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("人机验证超时，请检查网络连接后重试")), CAP_SOLVE_TIMEOUT)
      ),
    ]);
    return result.token;
  } finally {
    try {
      cap.widget?.remove?.();
    } catch (e) {
      console.error("Failed to remove cap widget:", e);
    }
  }
}
