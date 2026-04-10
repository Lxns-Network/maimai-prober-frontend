import type { Cap as CapType } from "@cap.js/widget";
import { CAPTCHA_ENDPOINT } from "@/main";

const CAP_WIDGET_URL = "https://cap.lxns.net/assets/widget.js";
const CAP_SOLVE_TIMEOUT = 60000;

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
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error(`人机验证资源加载失败`));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function solveCaptcha(): Promise<string> {
  await loadCapScript();
  const Cap = window.Cap as typeof CapType;
  const cap = new Cap({ apiEndpoint: CAPTCHA_ENDPOINT });

  try {
    const result = await Promise.race([
      new Promise<never>((_, reject) => {
        cap.addEventListener("error", (event) => {
          reject(new Error(event.detail?.message || "人机验证失败，请刷新页面后重试"));
        });
      }),
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
