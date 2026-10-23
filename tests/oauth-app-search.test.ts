import { describe, expect, it } from "vitest";
import { filterOAuthApps } from "@/utils/oauthAppSearch.ts";
import type { OAuthAppProps } from "@/types/developer";

const app = (overrides: Partial<OAuthAppProps>): OAuthAppProps => ({
  name: "App",
  redirect_uris: [],
  scope: "read_player",
  ...overrides,
});

const luoxue = app({
  client_id: "5f1c-luoxue",
  name: "LuoXue Helper",
  website: "https://luoxue.example.com/app",
  redirect_uris: ["https://luoxue.example.com/callback"],
  developer: { id: 1, name: "Alice Studio", url: "https://alice.example" },
});
const plain = app({
  client_id: "9a77-plain",
  name: "自制查分小工具",
  website: "https://tools.example.org",
  redirect_uris: ["https://tools.example.org/oauth/return"],
  developer: { id: 2, name: "示例开发者", url: "https://dev.example" },
});
const orphan = app({ name: "Orphan", developer: null });
const apps = [luoxue, plain, orphan];

describe("filterOAuthApps", () => {
  it.each(["", "   ", "\t\n"])("returns every app, in order, for blank query %j", (query) => {
    expect(filterOAuthApps(apps, query)).toEqual(apps);
  });

  it("matches the app name regardless of case", () => {
    expect(filterOAuthApps(apps, "luoxue helper")).toEqual([luoxue]);
    expect(filterOAuthApps(apps, "LUOXUE")).toEqual([luoxue]);
  });

  it("matches Chinese names", () => {
    expect(filterOAuthApps(apps, "查分")).toEqual([plain]);
  });

  it("matches the developer name", () => {
    expect(filterOAuthApps(apps, "alice")).toEqual([luoxue]);
    expect(filterOAuthApps(apps, "示例开发者")).toEqual([plain]);
  });

  it("matches the website", () => {
    expect(filterOAuthApps(apps, "tools.example.org")).toEqual([plain]);
  });

  it("matches the client id", () => {
    expect(filterOAuthApps(apps, "9a77")).toEqual([plain]);
  });

  it("matches redirect uris", () => {
    expect(filterOAuthApps(apps, "/oauth/return")).toEqual([plain]);
  });

  it("trims surrounding whitespace in the query", () => {
    expect(filterOAuthApps(apps, "  luoxue  ")).toEqual([luoxue]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterOAuthApps(apps, "no-such-app")).toEqual([]);
  });

  it("does not match placeholder text for missing fields", () => {
    for (const query of ["null", "undefined"]) {
      expect(filterOAuthApps([orphan], query)).toEqual([]);
    }
  });

  it("keeps apps without a developer, website or client id searchable by name", () => {
    expect(filterOAuthApps(apps, "orphan")).toEqual([orphan]);
  });

  it("does not match on scope, which every app shares", () => {
    expect(filterOAuthApps(apps, "read_player")).toEqual([]);
  });

  it("does not modify the input list", () => {
    const input = [luoxue, plain];
    filterOAuthApps(input, "luoxue");
    expect(input).toEqual([luoxue, plain]);
  });
});
