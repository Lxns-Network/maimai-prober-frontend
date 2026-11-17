import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectInstances } from "../chart/sweep/effects";
import type { EffectResource } from "./afb";
import * as instance from "./instance";
import { createEffectScheduler, type EffectSchedulerOptions } from "./schedule";

vi.mock("./instance", { spy: true });

const camera = { position: [0, 72, -1.4], up: [0, 0.8, 0.6] } as const;
const sink = { primitive() {}, particle() {} };

function resource(id: number): EffectResource {
  return {
    id,
    layerIndex: 0,
    bytes: 512,
    roots: [0],
    chunks: [],
    nodes: [
      {
        offset: 0,
        parent: null,
        type: 3,
        id: 0,
        flags: 0,
        defaultState: 0,
        controller: 128,
        settings: null,
        elements: [],
        children: [],
        states: [
          {
            offset: 64,
            id: 0,
            flags: 0,
            coordinateMode: 0,
            previousState: -1,
            nextState: -1,
            motions: [],
          },
        ],
      },
    ],
    pointer: () => 256,
    f32: (offset) => (offset === 272 ? 100 : 0),
    i32: () => 0,
    u32: () => 0,
    read: (_offset, size) => new Uint8Array(size),
  };
}

interface Row {
  id: number;
  created: number;
  end?: number;
  resource?: number;
}

function source(rows: Row[]): EffectSchedulerOptions {
  const n = rows.length;
  const instances: EffectInstances = {
    ids: Uint32Array.from(rows, (row) => row.id),
    resource: Uint16Array.from(rows, (row) => row.resource ?? 23),
    group: new Uint8Array(n),
    created: Int32Array.from(rows, (row) => row.created),
    start: Int32Array.from(rows, (row) => row.created),
    end: Int32Array.from(rows, (row) => row.end ?? 100),
    endReason: new Uint8Array(n),
    displayState: new Int8Array(n),
    animation: new Uint16Array(n),
    flags: new Uint8Array(n),
    scaleX: new Float32Array(n).fill(1),
    scaleY: new Float32Array(n).fill(1),
    scaleZ: new Float32Array(n).fill(1),
    reveal: Int32Array.from(rows, (row) => row.created),
    posX: new Float32Array(n),
    posY: new Float32Array(n),
    posZ: new Float32Array(n),
    kind: new Uint8Array(n),
  };
  const resources: EffectResource[] = [];
  resources[23] = resource(23);
  resources[24] = resource(24);
  return {
    resources,
    instances,
    consumption: {
      instance: new Uint32Array(),
      entry: new Uint8Array(),
      step: new Int32Array(),
      low: new Uint32Array(),
      high: new Uint32Array(),
      crt: new Uint32Array(),
    },
    moves: {
      instance: new Uint32Array(),
      step: new Int32Array(),
      x: new Float32Array(),
      y: new Float32Array(),
      z: new Float32Array(),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("live effect scheduling", () => {
  it("catches up additions without aging or recreating retained instances", () => {
    const rows: Row[] = [
      { id: 10, created: 0 },
      { id: 20, created: 2, resource: 24 },
    ];
    const scheduler = createEffectScheduler(source(rows));
    scheduler.advanceTo(10, camera, sink);
    const retained = vi.mocked(instance.createEffectInstance).mock.results[0].value;
    const age = retained.ages[retained.root];
    const publish = vi.fn<(step: number) => typeof sink>(() => sink);
    expect(scheduler.update(source([...rows, { id: 30, created: 9 }]), camera, publish)).toBe(true);
    expect(instance.createEffectInstance).toHaveBeenCalledTimes(3);
    expect(instance.createEffectPlayer).toHaveBeenCalledTimes(2);
    expect(retained.ages[retained.root]).toBe(age);
    expect(publish.mock.calls.map(([step]) => step)).toEqual([9, 10]);
    vi.mocked(instance.collectInstanceDraws).mockClear();
    scheduler.advanceTo(11, camera, sink);
    expect(
      vi.mocked(instance.collectInstanceDraws).mock.calls.map(([inst]) => inst.instanceId),
    ).toEqual([10, 30, 20]);
    expect(retained.ages[retained.root]).toBe(age + 0.5);
    expect(scheduler.liveCount).toBe(3);
  });

  it("keeps move cursors when pruning changes row indices, and activates future additions once", () => {
    const rows: Row[] = [
      { id: 1, created: 0, end: 4 },
      { id: 2, created: 1 },
    ];
    const original = source(rows);
    original.moves = {
      instance: Uint32Array.of(0, 1, 1),
      step: Int32Array.of(0, 2, 12),
      x: Float32Array.of(1, 3, 9),
      y: new Float32Array(3),
      z: new Float32Array(3),
    };
    const scheduler = createEffectScheduler(original);
    scheduler.advanceTo(10, camera, sink);
    const created = vi.mocked(instance.createEffectInstance).mock.results;
    const retained = created[created.length - 1].value;
    const next = source([rows[1], { id: 3, created: 15 }]);
    next.moves = {
      instance: Uint32Array.of(0, 0),
      step: Int32Array.of(2, 12),
      x: Float32Array.of(3, 9),
      y: new Float32Array(2),
      z: new Float32Array(2),
    };
    expect(scheduler.update(next, camera, () => sink)).toBe(true);
    expect(instance.createEffectInstance).toHaveBeenCalledTimes(2);
    expect(retained.boundMatrix[12]).toBe(3);
    scheduler.advanceTo(12, camera, sink);
    expect(retained.boundMatrix[12]).toBe(9);
    scheduler.advanceTo(15, camera, sink);
    expect(instance.createEffectInstance).toHaveBeenCalledTimes(3);
    expect(scheduler.liveCount).toBe(2);
  });

  it("rejects removing an active instance without changing the scheduler", () => {
    const original = source([{ id: 1, created: 0 }]);
    const scheduler = createEffectScheduler(original);
    scheduler.advanceTo(5, camera, sink);
    expect(scheduler.update(source([]), camera, () => sink)).toBe(false);
    scheduler.advanceTo(6, camera, sink);
    expect(instance.createEffectInstance).toHaveBeenCalledTimes(1);
    expect(scheduler.liveCount).toBe(1);
  });

  it("rebuilds from the updated source on a backward seek", () => {
    const first = { id: 1, created: 0 };
    const scheduler = createEffectScheduler(source([first]));
    scheduler.advanceTo(10, camera, sink);
    scheduler.update(source([first, { id: 2, created: 8 }]), camera, () => sink);
    scheduler.advanceTo(2, camera, sink);
    expect(scheduler.step).toBe(2);
    expect(scheduler.liveCount).toBe(1);
    const created = vi.mocked(instance.createEffectInstance).mock.results;
    const rebuilt = created[created.length - 1].value;
    expect(rebuilt.instanceId).toBe(1);
    expect(rebuilt.ages[rebuilt.root]).toBe(1.5);
  });
});
