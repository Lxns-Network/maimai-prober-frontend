import { describe, expect, it } from "vitest";
import { parseUsernameInput, profilePath } from "@/utils/profile.ts";

describe("parseUsernameInput", () => {
  it.each([
    ["  alice_01  ", "alice_01"],
    ["https://maimai.lxns.net/profile/alice_01", "alice_01"],
    ["https://maimai.lxns.net/profile/alice_01?game=chunithm#top", "alice_01"],
    ["maimai.lxns.net/profile/Alice%5F01/", "Alice_01"],
    [`http://localhost:3000${profilePath("bob")}`, "bob"],
  ])("reads %j as %j", (input, expected) => {
    expect(parseUsernameInput(input)).toBe(expected);
  });

  it("returns malformed links unchanged so validation can reject them", () => {
    expect(parseUsernameInput("https://maimai.lxns.net/profile/%E0%A4%A")).toBe(
      "https://maimai.lxns.net/profile/%E0%A4%A",
    );
  });
});
