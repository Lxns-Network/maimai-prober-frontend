/**
 * 检测当前运行环境是否为 iOS (iPhone/iPad/iPod) 上的 Webkit 内核。
 * 包含对 iPadOS 13+ 默认伪装为 macOS (MacIntel) 的多点触摸特征检测。
 */
export function isIOSWebkit(): boolean {
  if (typeof window === "undefined" || !window.navigator) return false;

  const { userAgent, platform, maxTouchPoints } = window.navigator;
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

  const isWebkit = /AppleWebKit/.test(userAgent);

  return isIOS && isWebkit;
}
