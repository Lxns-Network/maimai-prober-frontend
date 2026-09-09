import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAPI } from "@/utils/api/api.ts";
import { MaimaiSongList } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList } from "@/utils/api/song/chunithm.ts";
import { AliasList } from "@/utils/api/alias.ts";
import { createStorage } from "./storage.ts";

vi.mock("@/utils/api/api.ts", () => ({ fetchAPI: vi.fn() }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

const songData = { songs: [{ id: 1, title: "test" }], genres: [], versions: [] };

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  vi.mocked(fetchAPI).mockResolvedValue(Response.json(songData));
});

describe.each([
  { game: "maimai", create: () => new MaimaiSongList() },
  { game: "chunithm", create: () => new ChunithmSongList() },
])("$game song cache", ({ game, create }) => {
  it("reuses valid data with the same hash", async () => {
    localStorage.setItem(`${game}_songs_hash`, "hash");
    localStorage.setItem(`${game}_songs`, JSON.stringify(songData));
    const list = create();
    await expect(list.fetch("hash")).resolves.toEqual(songData.songs);
    expect(fetchAPI).not.toHaveBeenCalled();
  });

  it.each(["{broken", "null", '{"songs":[{"id":1}]}'])(
    "recovers from corrupt cache %s",
    async (cached) => {
      localStorage.setItem(`${game}_songs_hash`, "hash");
      localStorage.setItem(`${game}_songs`, cached);
      await expect(create().fetch("hash")).resolves.toEqual(songData.songs);
      expect(fetchAPI).toHaveBeenCalledWith(`${game}/song/list`, { method: "GET" });
    },
  );

  it("downloads a changed hash", async () => {
    localStorage.setItem(`${game}_songs_hash`, "old");
    localStorage.setItem(`${game}_songs`, JSON.stringify(songData));
    await create().fetch("new");
    expect(fetchAPI).toHaveBeenCalledOnce();
    expect(localStorage.getItem(`${game}_songs_hash`)).toBe("new");
  });

  it("uses downloaded songs when storage writes fail", async () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const list = create();
    await expect(list.fetch("hash")).resolves.toEqual(songData.songs);
    expect(list.find(1)?.title).toBe("test");
  });

  it("uses the network when storage reads are blocked", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    await expect(create().fetch("hash")).resolves.toEqual(songData.songs);
  });

  it("keeps loaded songs if the server later fails", async () => {
    const list = create();
    await list.fetch("old");
    vi.mocked(fetchAPI).mockResolvedValueOnce(Response.json(songData, { status: 503 }));
    await expect(list.fetch("new")).rejects.toMatchObject({ status: 503 });
    expect(list.songs).toEqual(songData.songs);
    expect(localStorage.getItem(`${game}_songs_hash`)).toBe("old");
  });

  it("rejects an invalid server response", async () => {
    vi.mocked(fetchAPI).mockResolvedValueOnce(Response.json({ message: "error" }));
    await expect(create().fetch("hash")).rejects.toThrow("无效的曲目列表");
    expect(localStorage.getItem(`${game}_songs_hash`)).toBeNull();
  });
});

describe("alias search index", () => {
  it("replaces the old index on refresh", async () => {
    const list = new AliasList("maimai");
    vi.mocked(fetchAPI).mockResolvedValueOnce(
      Response.json({ aliases: [{ song_id: 1, aliases: ["old"] }] }),
    );
    await list.fetch();
    vi.mocked(fetchAPI).mockResolvedValueOnce(
      Response.json({ aliases: [{ song_id: 2, aliases: ["new"] }] }),
    );
    await list.fetch();
    expect(list.searchMap.old).toBeUndefined();
    expect(list.searchMap.new).toEqual([2]);
  });

  it("accepts aliases that match Object prototype keys", async () => {
    const list = new AliasList("maimai");
    vi.mocked(fetchAPI).mockResolvedValueOnce(
      Response.json({
        aliases: [{ song_id: 1, aliases: ["__proto__", "constructor", "toString"] }],
      }),
    );
    await list.fetch();
    for (const alias of ["__proto__", "constructor", "toString"])
      expect(list.searchMap[alias]).toEqual([1]);
  });
});
