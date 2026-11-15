import { describe, expect, it } from "vitest";
import { orderPass, renderPass } from "./passOrder";

type Item = { name: string; key: number; depth: number };
const item = (name: string, key: number, depth: number): Item => ({ name, key, depth });
const names = (items: Item[]) => items.map((entry) => entry.name);

describe("orderPass", () => {
  const draws = [item("a", 2, 1), item("b", 1, 5), item("c", 2, 9), item("d", 1, 5)];

  it("orders by key ascending, then depth descending, keeping arrival order for ties", () => {
    expect(names(orderPass(draws, 6))).toEqual(["b", "d", "c", "a"]);
  });

  it("orders by key ascending then depth ascending", () => {
    expect(names(orderPass(draws, 7))).toEqual(["b", "d", "a", "c"]);
  });

  it("ignores depth for key-only modes", () => {
    expect(names(orderPass(draws, 5))).toEqual(["b", "d", "a", "c"]);
    expect(names(orderPass(draws, 4))).toEqual(["a", "c", "b", "d"]);
  });

  it("orders by depth ascending and descending, keeping arrival order for equal depths", () => {
    expect(names(orderPass(draws, 3))).toEqual(["a", "b", "d", "c"]);
    expect(names(orderPass(draws, 2))).toEqual(["c", "b", "d", "a"]);
  });

  it("does not change the input", () => {
    const copy = [...draws];
    orderPass(draws, 6);
    expect(draws).toEqual(copy);
  });

  it("keeps the arrival order of entries that share a key and depth", () => {
    const same = [item("first", 7, 3), item("second", 7, 3), item("third", 7, 3)];
    expect(names(orderPass(same, 6))).toEqual(["first", "second", "third"]);
    expect(names(orderPass(same, 2))).toEqual(["first", "second", "third"]);
  });
});

describe("renderPass", () => {
  it("maps the frame passes to their sort modes", () => {
    expect(renderPass(4)?.sortMode).toBe(5);
    expect(renderPass(8)?.sortMode).toBe(3);
    expect(renderPass(12)?.sortMode).toBe(3);
    expect(renderPass(16)?.sortMode).toBe(6);
    expect(renderPass(24)?.sortMode).toBe(5);
    expect(renderPass(20)).toBeUndefined();
  });
});
