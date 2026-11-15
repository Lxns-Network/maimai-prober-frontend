import { expect, it, vi } from "vitest";
import { loadHudResources } from "../src/pages/public/Chart/chunithm/rendering/hud";
const song = {
  title: "Title",
  artist: "Artist",
  difficulty: "MASTER",
  rawLevel: 15,
  levelDecimal: 50,
  exType: 0,
};
it("requests the interface scene and the declared jacket before the chart is read", async () => {
  const requested: string[] = [];
  vi.stubGlobal("window", { location: { href: "http://page.test/chunithm-chart" } });
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    return new Promise<Response>(() => {});
  });
  const controller = new AbortController();
  const loading = loadHudResources({
    base: "http://assets.test/engine/",
    song: new Promise<typeof song>(() => {}),
    jacketUrl: Promise.resolve("/jacket/2999.png"),
    signal: controller.signal,
  });
  loading.catch(() => {});
  await vi.waitFor(() =>
    expect([...requested].sort()).toEqual([
      "http://assets.test/engine/chunithm-hud.bin",
      "http://page.test/jacket/2999.png",
    ]),
  );
  controller.abort();
});
