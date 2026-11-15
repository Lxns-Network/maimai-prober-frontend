export type TextureTarget = "bc" | "astc" | "etc2" | "rgba8";
export interface DeviceSignals {
  s3tc: boolean;
  astc: boolean;
  etc2: boolean;
  mobile: boolean;
  deviceMemoryGb: number | null;
  maxTextureSize: number;
}
export interface TextureChoice {
  target: TextureTarget;
  dropTopMip: boolean;
  compare: boolean;
}

function supported(s: DeviceSignals, t: TextureTarget): boolean {
  return (
    t === "rgba8" || (t === "bc" && s.s3tc) || (t === "astc" && s.astc) || (t === "etc2" && s.etc2)
  );
}

/**
 * Picks the texture variant to upload. `override` forces a decodable target, or `compare` for
 * full-resolution RGBA8; undecodable or unknown overrides fall back to automatic selection.
 */
export function chooseTextureTarget(s: DeviceSignals, override: string | null): TextureChoice {
  if (override === "compare") return { target: "rgba8", dropTopMip: false, compare: true };
  if (override === "bc" || override === "astc" || override === "etc2" || override === "rgba8")
    if (supported(s, override)) return { target: override, dropTopMip: false, compare: false };
  if (!s.mobile && s.s3tc) return { target: "bc", dropTopMip: false, compare: false };
  for (const t of ["astc", "etc2", "bc"] as const)
    if (supported(s, t)) return { target: t, dropTopMip: false, compare: false };
  return { target: "rgba8", dropTopMip: true, compare: false };
}

export function isMobileDevice(): boolean {
  const nav = globalThis.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return nav?.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(nav?.userAgent ?? "");
}

export function readDeviceSignals(gl: WebGL2RenderingContext): DeviceSignals {
  const nav = globalThis.navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  return {
    s3tc: !!gl.getExtension("WEBGL_compressed_texture_s3tc"),
    astc: !!gl.getExtension("WEBGL_compressed_texture_astc"),
    etc2: !!gl.getExtension("WEBGL_compressed_texture_etc"),
    mobile: isMobileDevice(),
    deviceMemoryGb: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
  };
}
