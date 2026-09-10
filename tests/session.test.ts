import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkPermission,
  getLoginUserId,
  getSentryUser,
  isTokenExpired,
  resolvePostLoginTarget,
  UserPermission,
} from "@/utils/session.ts";
import { createStorage } from "./storage.ts";

const payload = { id: 123, name: "舞萌玩家🎵", permission: 5, exp: 2_000_000_000 };

function storeToken(claims: unknown) {
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  localStorage.setItem("token", `header.${encoded}.signature`);
  return encoded;
}

beforeEach(() => {
  vi.stubGlobal("window", { location: new URL("https://frontend.example.test/login") });
  vi.stubGlobal("localStorage", createStorage());
  vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false })));
});

describe("session payload", () => {
  it("treats inaccessible local storage as logged out", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(isTokenExpired()).toBe(true);
    expect(getSentryUser()).toBeNull();
    expect(checkPermission(UserPermission.Administrator)).toBe(false);
  });

  it("decodes Base64URL and UTF-8 names consistently", () => {
    expect(storeToken(payload)).toMatch(/[-_]/);
    expect(getLoginUserId()).toBe(123);
    expect(getSentryUser()).toEqual({ id: "123", username: payload.name, permission: 5 });
    expect(checkPermission(UserPermission.Administrator)).toBe(true);
    expect(checkPermission(UserPermission.Developer)).toBe(false);
    expect(isTokenExpired()).toBe(false);
  });

  it("expires at the exact boundary and respects the refresh buffer", () => {
    storeToken({ ...payload, exp: Date.now() / 1000 });
    expect(isTokenExpired()).toBe(true);
    storeToken({ ...payload, exp: Date.now() / 1000 + 10 });
    expect(isTokenExpired()).toBe(false);
    expect(isTokenExpired(30_000)).toBe(true);
  });

  it.each([null, {}, { ...payload, exp: "2000000000" }, { ...payload, permission: "4" }])(
    "rejects malformed claims: %j",
    (claims) => {
      storeToken(claims);
      expect(isTokenExpired()).toBe(true);
      expect(getLoginUserId()).toBeNull();
      expect(checkPermission(UserPermission.Administrator)).toBe(false);
    },
  );

  it("treats corrupt and absent tokens as logged out", () => {
    for (const token of ["", "broken", "header.%%%.signature"]) {
      localStorage.setItem("token", token);
      expect(getSentryUser()).toBeNull();
      expect(isTokenExpired()).toBe(true);
    }
  });
});

describe("post-login routing", () => {
  it("preserves a local pathname, query, and fragment", async () => {
    const target = "/user/oauth/authorize?client_id=test#details";
    await expect(resolvePostLoginTarget(target)).resolves.toBe(target);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "//outside.example.test",
    "/\\outside.example.test",
    "/\n/outside.example.test",
    "/.//outside.example.test",
    "/user/../login?redirect=/user/profile",
    "/register",
    "/login/",
    "https://outside.example.test",
  ])("rejects external and excluded redirects: %j", async (redirect) => {
    await expect(resolvePostLoginTarget(redirect)).resolves.toBe("/user/sync");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["maimai", "chunithm"])("reads JSON-persisted game %s", async (game) => {
    localStorage.setItem("game", JSON.stringify(game));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, data: { id: 1 } }));
    await expect(resolvePostLoginTarget()).resolves.toBe("/");
    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.test/user/${game}/player`,
      expect.anything(),
    );
  });

  it.each(["invalid-json", '"unsupported"'])("falls back for invalid game %s", async (game) => {
    localStorage.setItem("game", game);
    await resolvePostLoginTarget();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/user/maimai/player",
      expect.anything(),
    );
  });
});
