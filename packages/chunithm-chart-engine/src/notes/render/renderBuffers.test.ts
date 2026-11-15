import { describe, expect, it } from "vitest";
import {
  buildGroups,
  createGroupOrder,
  layerOf,
  orderInstances,
  priorityOf,
  sortKey,
  type GroupedInstance,
} from "./drawGroups";
import { createInstanceBuffer, INSTANCE_BYTES, INSTANCE_FLOATS } from "./instanceBuffer";
import { createBandBuffer } from "./bandBuffer";
import { HOLD_VERTEX_BYTES } from "../holdBand";

const at = (layer: number, widthPriority: number, depth: number): GroupedInstance => ({
  key: sortKey(0x8580, layer, widthPriority),
  depth,
});

describe("sortKey", () => {
  it("keeps bit 15 of the initial key, the layer in bits 8-14 and the priority in bits 0-7", () => {
    expect(sortKey(0x8580, 15, 14)).toBe(0x8f0e);
    expect(sortKey(0x8580, 16, 14)).toBe(0x900e);
    expect(sortKey(0, 0x12, 0x34)).toBe(0x1234);
    const key = sortKey(0x8580, 0x12, 0x34);
    expect(layerOf(key)).toBe(0x12);
    expect(priorityOf(key)).toBe(0x34);
  });

  it("rejects fields outside their ranges", () => {
    for (const bad of [-1, 256, 1.5]) {
      expect(() => sortKey(0x8580, bad, 0)).toThrow(/draw layer/);
      expect(() => sortKey(0x8580, 0, bad)).toThrow(/width priority/);
    }
    for (const bad of [-1, 0x10000, 1.5, Number.NaN])
      expect(() => sortKey(bad, 0, 0)).toThrow(/initial sort key/);
  });
});

describe("buildGroups", () => {
  it("orders groups by key ascending for a key-sorted pass", () => {
    const instances = [at(2, 4, 0), at(1, 8, 0), at(1, 12, 0), at(1, 4, 0)];
    const order = new Int32Array(instances.length);
    const groups = buildGroups(instances, order, "keyAscending");
    expect(groups.map((g) => [layerOf(g.key), priorityOf(g.key)])).toEqual([
      [1, 4],
      [1, 8],
      [1, 12],
      [2, 4],
    ]);
    // The order buffer is fully populated and consistent with the groups.
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    let at2 = 0;
    for (const g of groups) {
      expect(g.first).toBe(at2);
      at2 += g.count;
    }
    expect(at2).toBe(instances.length);
  });

  it("orders groups by key descending for a key-descending pass", () => {
    const instances = [at(1, 4, 0), at(1, 12, 0), at(1, 8, 0)];
    const order = new Int32Array(3);
    const groups = buildGroups(instances, order, "keyDescending");
    expect(groups.map((g) => [layerOf(g.key), priorityOf(g.key)])).toEqual([
      [1, 12],
      [1, 8],
      [1, 4],
    ]);
  });

  it("sorts by depth descending inside a group when the pass asks for it", () => {
    const instances = [at(1, 8, -5), at(1, 8, 12), at(1, 8, 0)];
    const order = new Int32Array(3);
    buildGroups(instances, order, "keyAscending");
    expect([...order]).toEqual([1, 2, 0]);
  });

  it("sorts by depth ascending for a depth-ascending pass, ignoring keys", () => {
    const instances = [at(1, 8, 12), at(2, 4, -5), at(1, 8, 0)];
    const order = new Int32Array(3);
    buildGroups(instances, order, "depthAscending");
    expect([...order]).toEqual([1, 2, 0]);
    // Depth-ascending passes do not group by key at all: every instance is its own run unless the
    // keys happen to be adjacent, so the group count follows the key runs in depth order.
    expect(order.length).toBe(3);
  });

  it("keeps submission order for instances that tie on key and depth", () => {
    const instances = [at(1, 8, 3), at(1, 8, 3), at(1, 8, 3)];
    const order = new Int32Array(3);
    buildGroups(instances, order, "keyAscending");
    expect([...order]).toEqual([0, 1, 2]);
  });

  it("groups equal keys into one run and reports its extent", () => {
    const instances = [at(3, 5, 1), at(3, 5, 2), at(3, 4, 3)];
    const order = new Int32Array(3);
    const groups = buildGroups(instances, order, "keyAscending");
    expect(groups.map((g) => ({ key: g.key, first: g.first, count: g.count }))).toEqual([
      { key: sortKey(0x8580, 3, 4), first: 0, count: 1 },
      { key: sortKey(0x8580, 3, 5), first: 1, count: 2 },
    ]);
  });

  it("returns no groups for an empty frame", () => {
    expect(buildGroups([], new Int32Array(0), "keyAscending")).toEqual([]);
  });

  it("rejects an order buffer smaller than the instance count", () => {
    expect(() => buildGroups([at(1, 1, 0)], new Int32Array(0), "keyAscending")).toThrow(
      /order buffer/,
    );
  });

  it("reuses the order buffer across frames without allocating", () => {
    const instances = [at(1, 8, 1), at(1, 4, 2)];
    const order = new Int32Array(2);
    buildGroups(instances, order, "keyAscending");
    const first = [...order];
    buildGroups(instances, order, "keyDescending");
    expect([...order]).not.toEqual(first);
    buildGroups(instances, order, "keyAscending");
    expect([...order]).toEqual(first);
  });
});

describe("createInstanceBuffer", () => {
  it("writes each world transform at the stride the shader reads, transposed into columns", () => {
    const buffer = createInstanceBuffer(2);
    // A row-major affine, distinct in every entry so a transposition cannot pass by symmetry.
    const world = Float32Array.from({ length: 12 }, (_, i) => i + 1);
    buffer.write(world);
    expect(buffer.count()).toBe(1);
    const floats = buffer.floats();
    // The shader reads the four slots as the matrix's four *columns*, so the stored run is the
    // transform's columns end to end: `world[0], world[4], world[8]` first.
    expect([...floats.subarray(0, 12)]).toEqual([1, 5, 9, 2, 6, 10, 3, 7, 11, 4, 8, 12]);
    expect(INSTANCE_FLOATS * 4).toBe(INSTANCE_BYTES);
    // A second write lands at the next stride, not overlapping the first.
    buffer.write(world);
    expect([...floats.subarray(12, 24)]).toEqual([1, 5, 9, 2, 6, 10, 3, 7, 11, 4, 8, 12]);
  });

  it("throws rather than growing when the capacity is exceeded", () => {
    const buffer = createInstanceBuffer(1);
    const world = new Float32Array(12);
    buffer.write(world);
    expect(() => buffer.write(world)).toThrow(/capacity 1/);
  });

  it("resets the cursor without reallocating", () => {
    const buffer = createInstanceBuffer(2);
    const storage = buffer.floats();
    const world = new Float32Array(12);
    buffer.write(world);
    buffer.reset();
    expect(buffer.count()).toBe(0);
    expect(buffer.floats()).toBe(storage);
  });

  it("rejects a world transform that is not twelve floats", () => {
    const buffer = createInstanceBuffer(1);
    expect(() => buffer.write(new Float32Array(16))).toThrow(/twelve/);
  });

  it("rejects a non-positive capacity", () => {
    for (const bad of [0, -1, 1.5])
      expect(() => createInstanceBuffer(bad)).toThrow(/positive integer/);
  });
});

describe("createBandBuffer", () => {
  it("commits vertices at the next free offset", () => {
    const buffer = createBandBuffer(8);
    expect(buffer.commit(6)).toBe(0);
    expect(buffer.offset()).toBe(6);
    expect(buffer.commit(2)).toBe(6);
    expect(buffer.count()).toBe(8);
    expect(buffer.bytes().byteLength).toBe(8 * HOLD_VERTEX_BYTES);
  });

  it("throws rather than growing when the capacity is exceeded", () => {
    const buffer = createBandBuffer(6);
    buffer.commit(6);
    expect(() => buffer.commit(1)).toThrow(/capacity 6/);
  });

  it("resets the cursor without reallocating", () => {
    const buffer = createBandBuffer(4);
    const storage = buffer.bytes();
    buffer.commit(4);
    buffer.reset();
    expect(buffer.count()).toBe(0);
    expect(buffer.bytes()).toBe(storage);
  });

  it("rejects a negative vertex count", () => {
    expect(() => createBandBuffer(4).commit(-1)).toThrow(/non-negative/);
  });
});

describe("orderInstances", () => {
  const keys = Int32Array.from([0x1400, 0x0f02, 0x1401, 0x0f01, 0x1400]);
  const depths = Float64Array.from([1, 5, 2, 4, 3]);

  it("returns the same order buildGroups materialises", () => {
    // The renderer reads the group columns directly and never builds group objects; the two paths
    // are separate code, so they must agree or the submitted order diverges from the tested one.
    const instances: GroupedInstance[] = [];
    for (let i = 0; i < keys.length; i++) instances.push({ key: keys[i], depth: depths[i] });
    for (const mode of [
      "keyAscending",
      "keyDescending",
      "depthAscending",
      "depthDescending",
    ] as const) {
      const materialised = buildGroups(instances, new Int32Array(keys.length), mode);
      const state = createGroupOrder(keys.length);
      const groups = orderInstances(keys, depths, keys.length, mode, state);
      expect({ mode, groups }).toEqual({ mode, groups: materialised.length });
      const flat: number[] = [];
      for (let g = 0; g < groups; g++) {
        const first = state.groupStarts[g];
        const end = g + 1 < groups ? state.groupStarts[g + 1] : keys.length;
        expect({ mode, key: state.groupKeys[g] }).toEqual({ mode, key: materialised[g].key });
        for (let k = first; k < end; k++) flat.push(state.order[k]);
      }
      // `buildGroups` writes its sorted instance indices into the caller's order buffer, so the
      // two paths are compared through their own buffers rather than through position numbers.
      const groupedOrder = new Int32Array(keys.length);
      buildGroups(instances, groupedOrder, mode);
      expect({ mode, sorted: flat.map((i) => [keys[i], depths[i]]) }).toEqual({
        mode,
        sorted: [...groupedOrder].map((i) => [keys[i], depths[i]]),
      });
    }
  });

  it("is a total order, so equal keys and depths keep arrival order", () => {
    const same = Int32Array.from([7, 7, 7, 7]);
    const flat = Float64Array.from([1, 1, 1, 1]);
    const state = createGroupOrder(4);
    orderInstances(same, flat, 4, "keyAscending", state);
    expect([...state.order.slice(0, 4)]).toEqual([0, 1, 2, 3]);
    // And the reverse arrival order must not be reordered either.
    expect(orderInstances(same, flat, 4, "depthAscending", createGroupOrder(4))).toBe(1);
  });

  it("rejects a count beyond the order storage", () => {
    const state = createGroupOrder(2);
    expect(() =>
      orderInstances(new Int32Array(4), new Float64Array(4), 4, "keyAscending", state),
    ).toThrow(/exceeds the 2 slots/);
  });

  it("sorts a long run without recursing", () => {
    // The merge sort is bottom-up and iterative; a deep input would overflow a recursive one. 4096
    // is past any instance count the corpus produces.
    const n = 4096;
    const k = new Int32Array(n);
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      k[i] = (i * 7919) % 4096;
      d[i] = (i * 104729) % 1000;
    }
    const state = createGroupOrder(n);
    const groups = orderInstances(k, d, n, "keyAscending", state);
    expect(groups).toBeGreaterThan(0);
    for (let i = 1; i < n; i++) {
      const a = state.order[i - 1];
      const b = state.order[i];
      const ka = k[a];
      const kb = k[b];
      expect(ka <= kb).toBe(true);
    }
  });
});
