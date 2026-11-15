export const CHUNITHM_ASSETS_MANIFEST_URL =
  "https://assets2.lxns.net/chunithm/engine/manifest.json";

function resourceDirectory(value: string, relativeTo: string): string {
  const url = new URL(value, relativeTo);
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash)
    throw new Error("CHUNITHM 资源目录地址不正确。");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/** Pins the main release and Stage index together; `?assets=` uses a local complete tree. */
export async function getChunithmAssetsUrl(
  pageUrl: string,
  override?: string | null,
  signal?: AbortSignal,
): Promise<{ base: string; stages: string }> {
  const overrideBase = override?.trim();
  if (overrideBase) {
    const base = resourceDirectory(overrideBase, pageUrl);
    return { base, stages: new URL("stages/", base).href };
  }
  const response = await fetch(CHUNITHM_ASSETS_MANIFEST_URL, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`资源入口加载失败（${response.status}）。`);
  const manifest = await response.json();
  if (
    manifest?.version !== 1 ||
    typeof manifest.base !== "string" ||
    !manifest.base.trim() ||
    typeof manifest.stages !== "string" ||
    !manifest.stages.trim()
  )
    throw new Error("CHUNITHM 资源入口格式不正确。");
  return {
    base: resourceDirectory(manifest.base.trim(), CHUNITHM_ASSETS_MANIFEST_URL),
    stages: resourceDirectory(manifest.stages.trim(), CHUNITHM_ASSETS_MANIFEST_URL),
  };
}

/** The song's charts, every difficulty in one file, on the shared asset host. */
export function getChunithmChartUrl(musicId: number): string {
  return `https://assets2.lxns.net/chunithm/chart/${musicId}.txt`;
}

/** The song's music on the shared asset host. */
export function getChunithmMusicUrl(musicId: number): string {
  return `https://assets2.lxns.net/chunithm/music/${musicId}.mp3`;
}

/** A jacket on the shared asset host; WORLD'S END songs use their original song's jacket. */
export function getChunithmJacketUrl(jacketId: number): string {
  return `https://assets2.lxns.net/chunithm/jacket/${jacketId}.png`;
}

/** 切换难度并从零开始；保留歌曲与其他设置。 */
export function selectChunithmChartDifficulty(pageUrl: string, difficulty: number): string {
  const url = new URL(pageUrl);
  url.searchParams.set("difficulty", String(difficulty));
  url.searchParams.delete("t");
  url.searchParams.delete("beat");
  return `${url.pathname}${url.search}${url.hash}`;
}
