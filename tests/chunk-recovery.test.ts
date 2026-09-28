import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkRecoveryScript } from "@/utils/chunkRecovery.ts";
import { createStorage } from "./storage.ts";

const NOW = 1_900_000_000_000;
const CHUNK_ERROR = new Error(
  "Failed to fetch dynamically imported module: https://frontend.example.test/assets/entry.js",
);

function bootPage(options: { href?: string; storage?: Storage } = {}) {
  const href = options.href ?? "https://frontend.example.test/songs?game=maimai";
  const storage = options.storage ?? createStorage();
  const handlers = new Map<string, (event: unknown) => void>();
  const location = { href, search: new URL(href).search, reload: vi.fn(), replace: vi.fn() };
  const history = { state: null, replaceState: vi.fn() };
  const windowStub = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
  };

  const run = new Function(
    "window",
    "location",
    "history",
    "sessionStorage",
    chunkRecoveryScript,
  ) as (
    windowArg: unknown,
    locationArg: unknown,
    historyArg: unknown,
    sessionStorageArg: Storage,
  ) => void;
  run(windowStub, location, history, storage);

  return {
    location,
    history,
    storage,
    preloadError: () => {
      const event = { payload: CHUNK_ERROR, preventDefault: vi.fn() };
      handlers.get("vite:preloadError")!(event);
      return event;
    },
    chunkRejection: (reason: unknown = CHUNK_ERROR) => {
      const event = { reason, preventDefault: vi.fn() };
      handlers.get("unhandledrejection")!(event);
      return event;
    },
  };
}

function seedReloadLog(storage: Storage, timestamps: number[]) {
  storage.setItem("chunk_reload_log", JSON.stringify(timestamps));
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("chunk load recovery", () => {
  it("reloads on the first failure without cancelling vite:preloadError", () => {
    const page = bootPage();
    const event = page.preloadError();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(page.storage.getItem("chunk_reload_log")!)).toEqual([NOW]);
  });

  it("uses a cache-busting _r redirect for the second attempt", () => {
    const storage = createStorage();
    seedReloadLog(storage, [NOW - 1_000]);
    const page = bootPage({ storage });
    page.preloadError();
    expect(page.location.reload).not.toHaveBeenCalled();
    expect(page.location.replace).toHaveBeenCalledWith(
      `https://frontend.example.test/songs?game=maimai&_r=${NOW}`,
    );
  });

  it("consumes one reload attempt when a failure fires both events", () => {
    const page = bootPage();
    page.preloadError();
    const rejection = page.chunkRejection();
    expect(rejection.preventDefault).toHaveBeenCalledTimes(1);
    expect(page.location.reload).toHaveBeenCalledTimes(1);
    expect(page.location.replace).not.toHaveBeenCalled();
    expect(JSON.parse(page.storage.getItem("chunk_reload_log")!)).toEqual([NOW]);
  });

  it("stops swallowing errors once the reload budget is exhausted", () => {
    const storage = createStorage();
    seedReloadLog(storage, [NOW - 5_000, NOW - 1_000]);
    const page = bootPage({ storage });
    const event = page.preloadError();
    const rejection = page.chunkRejection();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(rejection.preventDefault).not.toHaveBeenCalled();
    expect(page.location.reload).not.toHaveBeenCalled();
    expect(page.location.replace).not.toHaveBeenCalled();
  });

  it("expires reload attempts outside the 20s window", () => {
    const storage = createStorage();
    seedReloadLog(storage, [NOW - 25_000, NOW - 21_000]);
    const page = bootPage({ storage });
    page.preloadError();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
  });

  it("ignores rejections that are not chunk load failures", () => {
    const page = bootPage();
    const rejection = page.chunkRejection(new TypeError("undefined is not a function"));
    expect(rejection.preventDefault).not.toHaveBeenCalled();
    expect(page.location.reload).not.toHaveBeenCalled();
  });

  it("strips the _r parameter left by a cache-busting recovery", () => {
    const page = bootPage({ href: "https://frontend.example.test/songs?game=maimai&_r=123" });
    expect(page.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "https://frontend.example.test/songs?game=maimai",
    );
  });
});
