import { describe, expect, it } from "vitest";
import {
  getTokenSessionIdentity,
  isTokenSessionExpired,
  parseStoredGame,
  resolveSameOriginRedirect,
} from "./sessionCore.ts";

const ORIGIN = "https://maimai.lxns.net";

describe("resolveSameOriginRedirect", () => {
  it("keeps safe same-origin paths", () => {
    expect(resolveSameOriginRedirect("/user/scores?q=1#result", ORIGIN)).toBe(
      "/user/scores?q=1#result",
    );
  });

  it("rejects external and backslash redirects", () => {
    expect(resolveSameOriginRedirect("//evil.example/path", ORIGIN)).toBeNull();
    expect(resolveSameOriginRedirect("/\\evil.example/path", ORIGIN)).toBeNull();
    expect(resolveSameOriginRedirect("/%5Cevil.example/path", ORIGIN)).toBeNull();
    expect(resolveSameOriginRedirect("https://evil.example/path", ORIGIN)).toBeNull();
  });

  it("rejects authentication loop targets", () => {
    expect(resolveSameOriginRedirect("/login?next=/", ORIGIN)).toBeNull();
    expect(resolveSameOriginRedirect("/login/", ORIGIN)).toBeNull();
    expect(resolveSameOriginRedirect("/register#form", ORIGIN)).toBeNull();
  });
});

describe("parseStoredGame", () => {
  it("accepts Mantine JSON and legacy storage values", () => {
    expect(parseStoredGame('"maimai"')).toBe("maimai");
    expect(parseStoredGame('"chunithm"')).toBe("chunithm");
    expect(parseStoredGame("chunithm")).toBe("chunithm");
    expect(parseStoredGame("invalid")).toBe("maimai");
  });
});

describe("getTokenSessionIdentity", () => {
  it("remains stable across refreshed tokens for the same user", () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const first = `${encode({ alg: "none" })}.${encode({ id: 42, exp: 1 })}.signature`;
    const refreshed = `${encode({ alg: "none" })}.${encode({ id: 42, exp: 2 })}.signature`;
    const anotherUser = `${encode({ alg: "none" })}.${encode({ id: 43, exp: 2 })}.signature`;

    expect(getTokenSessionIdentity(first)).toBe(getTokenSessionIdentity(refreshed));
    expect(getTokenSessionIdentity(first)).not.toBe(getTokenSessionIdentity(anotherUser));
  });
});

describe("isTokenSessionExpired", () => {
  it("evaluates the token snapshot against the supplied clock", () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "none" })}.${encode({ id: 42, exp: 2 })}.signature`;

    expect(isTokenSessionExpired(token, 1000)).toBe(false);
    expect(isTokenSessionExpired(token, 3000)).toBe(true);
    expect(isTokenSessionExpired("malformed", 1000)).toBe(true);
  });
});
