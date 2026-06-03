import type { Cap as CapType } from "@cap.js/widget";
import { CAPTCHA_ENDPOINT } from "@/main";

const CAP_WIDGET_URL = "https://cap.lxns.net/assets/widget.js";
const CAP_SOLVE_TIMEOUT = 60000;

let scriptPromise: Promise<void> | null = null;

// cap.js 的挑战/令牌带有过期时间，校验依赖客户端系统时钟。
// 当设备时间不准（如双系统未同步、未开启 NTP）时，服务端会返回类似
// "invalid expiration time" 的错误，对用户而言难以理解。这里将这类
// 时间相关错误转换为更明确的提示。
export function friendlyCaptchaError(message?: string): string {
  const fallback = "人机验证失败，请刷新页面后重试";
  if (!message) return fallback;
  if (/expir|invalid.*time|time.*invalid|clock|timestamp/i.test(message)) {
    return "人机验证失败，可能是设备系统时间不准，请校准时间（开启自动同步）后重试";
  }
  return message;
}

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
          reject(new Error(friendlyCaptchaError(event.detail?.message)));
        });
      }),
      cap.solve(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("人机验证超时，请检查网络连接后重试")),
          CAP_SOLVE_TIMEOUT,
        ),
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
