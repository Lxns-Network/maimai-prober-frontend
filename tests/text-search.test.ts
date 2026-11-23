import { describe, expect, it } from "vitest";
import { normalizeSearchText, searchByRelevance } from "@/utils/textSearch.ts";

const items = [
  { name: "Fire Band", note: "" },
  { name: "Night of Fire", note: "" },
  { name: "Fire", note: "" },
  { name: "Other", note: "fire starter" },
  { name: "Water", note: undefined },
  { name: "♪　Ｌｘｎｓ　♪", note: undefined },
];
const fields = (item: (typeof items)[number]) => [item.name, item.note];
const names = (result: typeof items) => result.map((item) => item.name);

describe("normalizeSearchText", () => {
  it("folds full-width and half-width forms, case and whitespace", () => {
    expect(normalizeSearchText("♪　Ｌｘｎｓ　♪")).toBe("♪lxns♪");
    expect(normalizeSearchText("ﾎﾞｸﾗ")).toBe("ボクラ");
  });
});

describe("searchByRelevance", () => {
  it("returns nothing for a blank query", () => {
    expect(searchByRelevance(items, "  ", fields, 10)).toEqual([]);
    expect(searchByRelevance(items, "　", fields, 10)).toEqual([]);
  });

  it("ranks exact, then prefix, then substring matches across fields, keeping order within a rank", () => {
    expect(names(searchByRelevance(items, "FIRE", fields, 10))).toEqual([
      "Fire",
      "Fire Band",
      "Other",
      "Night of Fire",
    ]);
  });

  it("truncates to the limit after ranking", () => {
    expect(names(searchByRelevance(items, "fire", fields, 2))).toEqual(["Fire", "Fire Band"]);
  });

  it("matches across full-width and half-width forms and ignores whitespace", () => {
    expect(names(searchByRelevance(items, "lxns", fields, 10))).toEqual(["♪　Ｌｘｎｓ　♪"]);
    expect(names(searchByRelevance(items, "♪ Lxns ♪", fields, 10))).toEqual(["♪　Ｌｘｎｓ　♪"]);
    expect(names(searchByRelevance(items, "ＮＩＧＨＴＯＦ", fields, 10))).toEqual([
      "Night of Fire",
    ]);
  });
});
