import { describe, expect, it } from "vitest";
import type { Pack, PackEntry } from "../assets/packFormat";
import { motionFrame, motionSeed } from "./motionClock";
import { createMotionSupply } from "./motionSupply";

const DOWN = 0.4000000059604645;
const TICK = { frameDelta: 0.5, paused: false };

type Material = { uvAnimation?: { resource: string; tracks: number[]; loop?: boolean } };

function packOf(
  models: Record<string, Material[]>,
  resources: Record<string, unknown> = {
    "uvc/ntt_airup": { frameCount: 121 },
    "uvc/ntt_ahact": { frameCount: 21 },
  },
): Pack {
  const entries = new Map<string, PackEntry>();
  for (const [name, materials] of Object.entries(models))
    entries.set(`note/model/${name}`, {
      name: `note/model/${name}`,
      kind: "table",
      offset: 0,
      length: 0,
      meta: { materials },
    });
  for (const [name, meta] of Object.entries(resources))
    entries.set(name, {
      name,
      kind: "uvc",
      offset: 0,
      length: 0,
      meta: meta as Record<string, unknown>,
    });
  return { version: 1, engine: "chunithm", bytes: new Uint8Array(), entries };
}

const up = { uvAnimation: { resource: "uvc/ntt_airup", tracks: [0], loop: true } };
const act = { uvAnimation: { resource: "uvc/ntt_ahact", tracks: [0], loop: true } };
const extap = { uvAnimation: { resource: "uvc/ntt_extap_nml", tracks: [0, 1] } };

describe("motion supply", () => {
  const pack = () =>
    packOf(
      { "146": [up, up], "178": [up], "342": [{}, act], "146~1": [up], "82": [extap], "7": [{}] },
      {
        "uvc/ntt_airup": { frameCount: 121 },
        "uvc/ntt_ahact": { frameCount: 21 },
        "uvc/ntt_extap_nml": { frameCount: 51 },
      },
    );

  it("supplies each bound model the frame its own clock reaches after the tick", () => {
    const frameOf = createMotionSupply(pack()).at(216037.5, TICK);
    expect(frameOf("note/model/146")).toBe(
      motionFrame({ upper: 120, loop: true }, motionSeed(216037.5, 1), TICK),
    );
    expect(frameOf("note/model/146~1")).toBe(frameOf("note/model/146"));
    expect(frameOf("note/model/178")).toBe(
      motionFrame({ upper: 120, loop: true }, motionSeed(216037.5, DOWN), TICK),
    );
    expect(frameOf("note/model/342")).toBe(
      motionFrame({ upper: 20, loop: true }, motionSeed(216037.5, 1), TICK),
    );
    expect(frameOf("note/model/178")).not.toBe(frameOf("note/model/146"));
  });

  it("leaves models without a clock binding to the shared frame", () => {
    const frameOf = createMotionSupply(pack()).at(216000, TICK);
    expect(frameOf("note/model/82")).toBeUndefined();
    expect(frameOf("note/model/7")).toBeUndefined();
    expect(frameOf("note/model/999")).toBeUndefined();
    expect(frameOf("note/band/hold")).toBeUndefined();
  });

  it("is a pure function of the timeline frame, whichever order frames are asked in", () => {
    const supply = createMotionSupply(pack());
    const sample = (absolute: number) => {
      const frameOf = supply.at(absolute, TICK);
      return ["note/model/146", "note/model/178", "note/model/342"].map(frameOf);
    };
    const first = [216000, 216123.5, 217000.25, 216000.5].map(sample);
    const back = [216000.5, 217000.25, 216123.5, 216000].map(sample).reverse();
    expect(back).toEqual(first);
    expect(new Set(first.map((row) => row[0])).size).toBeGreaterThan(1);
  });

  it("honours the pause gate of the tick", () => {
    const frameOf = createMotionSupply(pack()).at(216037.5, { frameDelta: 0.5, paused: true });
    expect(frameOf("note/model/146")).toBe(
      motionFrame({ upper: 120, loop: true }, motionSeed(216037.5, 1), {
        frameDelta: 0.5,
        paused: true,
      }),
    );
  });

  it("refuses a clock it has no rule or resource for", () => {
    expect(() => createMotionSupply(packOf({ "100": [up] }))).toThrow(/model 100/);
    expect(() =>
      createMotionSupply(packOf({ "146": [{ uvAnimation: { ...up.uvAnimation, loop: false } }] })),
    ).toThrow(/loop/);
    expect(() =>
      createMotionSupply(packOf({ "146": [up] }, { "uvc/other": { frameCount: 5 } })),
    ).toThrow(/uvc\/ntt_airup/);
    expect(() => createMotionSupply(packOf({ "146": [up] }, { "uvc/ntt_airup": {} }))).toThrow(
      /frame count/,
    );
    expect(() => createMotionSupply(packOf({ "146": [up, act] }))).toThrow(/one resource/);
  });

  it("refuses an animated model without a clock unless the shared frame is proven for it", () => {
    const shared = (id: string, frameCount: number) =>
      createMotionSupply(packOf({ [id]: [extap] }, { "uvc/ntt_extap_nml": { frameCount } }));
    expect(() => shared("82", 51)).not.toThrow();
    expect(() => shared("97", 51)).not.toThrow();
    expect(() => shared("82~1", 51)).not.toThrow();
    expect(() => shared("130", 51)).toThrow(/model 130/);
    expect(() => shared("81", 51)).toThrow(/model 81/);
    expect(() => shared("98", 51)).toThrow(/model 98/);
    expect(() => shared("82", 50)).toThrow(/frame count/);
    expect(() =>
      createMotionSupply(packOf({ "82": [extap] }, { "uvc/other": { frameCount: 51 } })),
    ).toThrow(/uvc\/ntt_extap_nml/);
    expect(() =>
      createMotionSupply(
        packOf(
          { "82": [up, extap] },
          { "uvc/ntt_airup": { frameCount: 121 }, "uvc/ntt_extap_nml": { frameCount: 51 } },
        ),
      ),
    ).toThrow(/mixes/);
  });

  it("rejects an unusable timeline frame when the frame is asked for", () => {
    const supply = createMotionSupply(pack());
    expect(() => supply.at(NaN, TICK)("note/model/146")).toThrow(RangeError);
    expect(() => supply.at(-1, TICK)("note/model/146")).toThrow(RangeError);
  });
});

describe("required model clocks", () => {
  it("rejects a required animated model with a missing binding rather than drawing it static", () => {
    expect(() =>
      createMotionSupply(packOf({ "146": [{}] }), { requiredModels: ["note/model/146"] }),
    ).toThrow(/146.*binding/i);
    expect(() =>
      createMotionSupply(packOf({ "146": [up] }), { requiredModels: ["note/model/146"] }),
    ).not.toThrow();
    expect(() =>
      createMotionSupply(packOf({ "146": [{}], "7": [{}] }), { requiredModels: ["note/model/7"] }),
    ).not.toThrow();
  });
});

describe("clocks only the bake records", () => {
  const dmg = { uvAnimation: { resource: "uvc/ntt_dmg", tracks: [0], loop: true } };
  const withMine = () => packOf({ "133": [{}, dmg, dmg] }, { "uvc/ntt_dmg": { frameCount: 50 } });

  it("marks a clock-bound MINE model animated and leaves its frame to the recording", () => {
    const supply = createMotionSupply(withMine());
    expect(supply.animated("note/model/133")).toBe(true);
    expect(supply.at(216000, TICK)("note/model/133")).toBeUndefined();
  });

  it("rejects a required MINE model without its clock binding", () => {
    expect(() =>
      createMotionSupply(packOf({ "133": [{}] }), { requiredModels: ["note/model/133"] }),
    ).toThrow(/133.*binding/i);
    expect(() =>
      createMotionSupply(withMine(), { requiredModels: ["note/model/133"] }),
    ).not.toThrow();
  });

  it("still checks the resource a recorded clock names", () => {
    expect(() =>
      createMotionSupply(packOf({ "133": [dmg] }, { "uvc/other": { frameCount: 50 } })),
    ).toThrow(/uvc\/ntt_dmg/);
    expect(() => createMotionSupply(packOf({ "133": [dmg] }, { "uvc/ntt_dmg": {} }))).toThrow(
      /frame count/,
    );
  });
});
