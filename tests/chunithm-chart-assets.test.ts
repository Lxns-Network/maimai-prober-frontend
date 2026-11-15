import { afterEach, expect, it, vi } from "vitest";
import {
  getChunithmJacketUrl,
  getChunithmAssetsUrl,
  selectChunithmChartDifficulty,
  CHUNITHM_ASSETS_MANIFEST_URL,
} from "../src/pages/public/Chart/chunithm/assets/urls";

afterEach(() => vi.unstubAllGlobals());

it("keeps Stage in the selected release, never the old standalone Stage directory", async () => {
  const base = await getChunithmAssetsUrl("https://preview.test/chart", "/candidate/");
  expect(base).toEqual({
    base: "https://preview.test/candidate/",
    stages: "https://preview.test/candidate/stages/",
  });
});

it("resolves the release from the bucket manifest unless a directory is supplied", async () => {
  const page = "https://preview.test/chunithm-chart?chart_id=1086";
  const fetchManifest = vi.fn(async () =>
    Response.json({ version: 1, base: "releases/example/", stages: "stage-indexes/previous/" }),
  );
  vi.stubGlobal("fetch", fetchManifest);
  expect(await getChunithmAssetsUrl(page, "/engine")).toEqual({
    base: "https://preview.test/engine/",
    stages: "https://preview.test/engine/stages/",
  });
  expect(fetchManifest).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  expect(await getChunithmAssetsUrl(page, " ", signal)).toEqual({
    base: "https://assets2.lxns.net/chunithm/engine/releases/example/",
    stages: "https://assets2.lxns.net/chunithm/engine/stage-indexes/previous/",
  });
  expect(fetchManifest).toHaveBeenCalledWith(CHUNITHM_ASSETS_MANIFEST_URL, {
    signal,
    cache: "no-cache",
  });
});

it("reports missing or invalid manifests without selecting another resource tree", async () => {
  const fetchManifest = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchManifest);
  const page = "https://preview.test/chart";
  await expect(getChunithmAssetsUrl(page)).rejects.toThrow("404");
  for (const manifest of [null, { version: 2, base: "releases/a/" }, { version: 1, base: " " }]) {
    fetchManifest.mockResolvedValueOnce(Response.json(manifest));
    await expect(getChunithmAssetsUrl(page)).rejects.toThrow("格式不正确");
  }
  for (const base of ["javascript:alert(1)", "https://assets.test/engine?x=1"]) {
    fetchManifest.mockResolvedValueOnce(
      Response.json({ version: 1, base, stages: "stage-indexes/example/" }),
    );
    await expect(getChunithmAssetsUrl(page)).rejects.toThrow("地址不正确");
  }
});

it("names jackets by id on the shared asset host", () => {
  expect(getChunithmJacketUrl(1086)).toBe("https://assets2.lxns.net/chunithm/jacket/1086.png");
});

it("switches the difficulty from the start, keeping the song and the other settings", () => {
  const page =
    "https://example.test/chunithm-chart?chart_id=1086&difficulty=3&t=12&speedRow=7&assets=x#preview";
  const selected = new URL(selectChunithmChartDifficulty(page, 4), page);
  expect(selected.searchParams.get("chart_id")).toBe("1086");
  expect(selected.searchParams.get("difficulty")).toBe("4");
  expect(selected.searchParams.has("t")).toBe(false);
  expect(selected.searchParams.get("speedRow")).toBe("7");
  expect(selected.searchParams.get("assets")).toBe("x");
  expect(selected.hash).toBe("#preview");
});
