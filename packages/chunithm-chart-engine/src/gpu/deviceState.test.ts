import { describe, expect, it } from "vitest";
import {
  assertDeviceUniforms,
  compileDeviceState,
  createDeviceState,
  type DeviceStateTarget,
  type PackedStateCommand,
} from "./deviceState";

/** A complete, supported list: depth tested, alpha blended, back-face culled, solid. */
const BASE: PackedStateCommand[] = [
  [27, 1],
  [206, 0],
  [171, 1],
  [19, 5],
  [20, 6],
  [209, 1],
  [207, 1],
  [208, 1],
  [193, 0xff000000],
  [15, 0],
  [24, 25],
  [25, 5],
  [7, 1],
  [14, 0],
  [23, 4],
  [195, 0x80000000],
  [175, 0x80000000],
  [52, 0],
  [22, 2],
  [174, 0],
  [168, 15],
  [8, 3],
];

const withState = (state: number, value: number): PackedStateCommand[] => [...BASE, [state, value]];
const without = (state: number): PackedStateCommand[] => BASE.filter(([s]) => s !== state);

function fakeGl() {
  const calls: string[] = [];
  const gl = {
    DEPTH_TEST: 1,
    BLEND: 2,
    CULL_FACE: 3,
    CCW: 4,
    BACK: 5,
    FRONT: 6,
    NEVER: 10,
    LESS: 11,
    EQUAL: 12,
    LEQUAL: 13,
    GREATER: 14,
    NOTEQUAL: 15,
    GEQUAL: 16,
    ALWAYS: 17,
    ZERO: 20,
    ONE: 21,
    SRC_COLOR: 22,
    ONE_MINUS_SRC_COLOR: 23,
    SRC_ALPHA: 24,
    ONE_MINUS_SRC_ALPHA: 25,
    DST_ALPHA: 26,
    ONE_MINUS_DST_ALPHA: 27,
    DST_COLOR: 28,
    ONE_MINUS_DST_COLOR: 29,
    SRC_ALPHA_SATURATE: 30,
    FUNC_ADD: 40,
    FUNC_SUBTRACT: 41,
    FUNC_REVERSE_SUBTRACT: 42,
    MIN: 43,
    MAX: 44,
    enable: (c: number) => calls.push(`enable ${c}`),
    disable: (c: number) => calls.push(`disable ${c}`),
    depthMask: (f: boolean) => calls.push(`depthMask ${f}`),
    depthFunc: (f: number) => calls.push(`depthFunc ${f}`),
    blendFuncSeparate: (...a: number[]) => calls.push(`blendFuncSeparate ${a.join(",")}`),
    blendEquationSeparate: (...a: number[]) => calls.push(`blendEquationSeparate ${a.join(",")}`),
    blendColor: (...a: number[]) => calls.push(`blendColor ${a.join(",")}`),
    frontFace: () => calls.push("frontFace"),
    cullFace: (m: number) => calls.push(`cullFace ${m}`),
    colorMask: (...a: boolean[]) => calls.push(`colorMask ${a.join(",")}`),
    uniform1f: (l: unknown, v: number) =>
      calls.push(`uniform1f ${(l as { name: string }).name} ${v}`),
    uniform1i: (l: unknown, v: number) =>
      calls.push(`uniform1i ${(l as { name: string }).name} ${v}`),
  };
  return { gl: gl as DeviceStateTarget, calls };
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function statefulGl() {
  const held: Record<string, unknown> = {};
  const uniforms = new Map<WebGLProgram, Record<string, number>>();
  let active: WebGLProgram | null = null;
  const { gl: base } = fakeGl();
  const gl = {
    ...base,
    enable: (c: number) => (held[`cap${c}`] = true),
    disable: (c: number) => (held[`cap${c}`] = false),
    depthMask: (f: boolean) => (held.depthMask = f),
    depthFunc: (f: number) => (held.depthFunc = f),
    blendFuncSeparate: (...a: number[]) => (held.blendFunc = a.join(",")),
    blendEquationSeparate: (...a: number[]) => (held.blendEquation = a.join(",")),
    blendColor: (...a: number[]) => (held.blendColor = a.join(",")),
    frontFace: () => {},
    cullFace: (m: number) => (held.cullFace = m),
    colorMask: (...a: boolean[]) => (held.colorMask = a.join(",")),
    uniform1f: (l: unknown, v: number) => setUniform((l as { name: string }).name, v),
    uniform1i: (l: unknown, v: number) => setUniform((l as { name: string }).name, v),
  };
  const setUniform = (name: string, value: number) => {
    if (!active) throw new Error("no program");
    const table = uniforms.get(active) ?? {};
    table[name] = value;
    uniforms.set(active, table);
  };
  const bits = new DataView(new ArrayBuffer(4));
  return {
    gl: gl as DeviceStateTarget,
    use(program: WebGLProgram) {
      active = program;
    },
    clobber(next: () => number) {
      for (const key of Object.keys(held)) delete held[key];
      held.depthMask = next() < 0.5;
      held.cap1 = next() < 0.5;
      held.cap2 = next() < 0.5;
      held.cap3 = next() < 0.5;
      held.depthFunc = Math.floor(next() * 9);
      held.blendFunc = "x";
      held.blendEquation = "x";
      held.blendColor = "x";
      held.cullFace = Math.floor(next() * 9);
      held.colorMask = "x";
    },
    expect(values: Float64Array, program: WebGLProgram) {
      const separate = values[206] !== 0;
      const factor = (state: number) => 20 + values[state] - 1;
      expect(held.cap1).toBe(values[7] !== 0);
      expect(held.depthMask).toBe(values[14] !== 0);
      expect(held.depthFunc).toBe(10 + values[23] - 1);
      expect(held.cap2).toBe(values[27] !== 0);
      expect(held.blendFunc).toBe(
        [
          factor(19),
          factor(20),
          separate ? factor(207) : factor(19),
          separate ? factor(208) : factor(20),
        ].join(","),
      );
      expect(held.blendEquation).toBe(
        [40 + values[171] - 1, 40 + (separate ? values[209] : values[171]) - 1].join(","),
      );
      expect(held.cap3).toBe(values[22] !== 1);
      if (values[22] !== 1) expect(held.cullFace).toBe(values[22] === 2 ? 5 : 6);
      const mask = values[168];
      expect(held.colorMask).toBe(
        [(mask & 1) !== 0, (mask & 2) !== 0, (mask & 4) !== 0, (mask & 8) !== 0].join(","),
      );
      const table = uniforms.get(program);
      bits.setUint32(0, values[195], true);
      expect(table?.uDepthBias).toBe(bits.getFloat32(0, true));
      expect(table?.uAlphaFunc).toBe(values[25]);
      expect(table?.uAlphaRef).toBe(values[24] / 255);
      expect(table?.uAlphaTestEnabled).toBe(values[15]);
    },
  };
}

const locations = new Map<string, WebGLUniformLocation | null>(
  ["uDepthBias", "uAlphaTestEnabled", "uAlphaFunc", "uAlphaRef"].map((name) => [
    name,
    { name } as unknown as WebGLUniformLocation,
  ]),
);
const program = {} as WebGLProgram;

describe("device state", () => {
  it("accepts a complete supported list", () => {
    expect(() => compileDeviceState(BASE, "test")).not.toThrow();
  });

  it("rejects a list that leaves a state unset", () => {
    expect(() => compileDeviceState(without(22), "test")).toThrow(/render state 22 is missing/);
  });

  it.each([
    ["stencil", 52, 1, /stencil/],
    ["scissor", 174, 1, /scissor/],
    ["a non-solid fill", 8, 2, /solid fill/],
    ["slope depth bias", 175, 0x80000001, /slope/],
    ["multisample coverage", 181, 2, /multisample/],
    ["an unknown state", 999, 1, /not supported/],
    ["a blend factor out of range", 19, 12, /blend factor/],
    ["a cull mode out of range", 22, 4, /cull mode/],
    ["a negative value", 168, -1, /invalid value/],
  ])("rejects %s", (_label, state, value, message) => {
    expect(() => compileDeviceState(withState(state, value), "test")).toThrow(message);
  });

  it("applies every state on first use, then nothing while the state is unchanged", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const set = compileDeviceState(BASE, "test");
    device.apply(set, program, locations);
    expect(calls).toContain("enable 1");
    expect(calls).toContain("depthMask false");
    expect(calls).toContain("depthFunc 13");
    expect(calls).toContain("enable 2");
    expect(calls).toContain("blendFuncSeparate 24,25,24,25");
    expect(calls).toContain("blendEquationSeparate 40,40");
    expect(calls).toContain("enable 3");
    expect(calls).toContain("cullFace 5");
    expect(calls).toContain("colorMask true,true,true,true");
    expect(calls).toContain("uniform1f uAlphaRef 0.09803921568627451");
    calls.length = 0;
    device.apply(set, program, locations);
    expect(calls).toEqual([]);
  });

  it("issues only the calls for the states that differ", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    device.apply(compileDeviceState(BASE, "a"), program, locations);
    calls.length = 0;
    const next = BASE.map(([s, v]): PackedStateCommand => (s === 22 ? [22, 3] : [s, v]));
    device.apply(compileDeviceState(next, "b"), program, locations);
    expect(calls).toEqual(["enable 3", "frontFace", "cullFace 6"]);
  });

  it("turns culling off for cull mode 1 and does not set a face", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const state = BASE.map(([s, v]): PackedStateCommand => (s === 22 ? [22, 1] : [s, v]));
    device.apply(compileDeviceState(state, "t"), program, locations);
    expect(calls).toContain("disable 3");
    expect(calls.some((c) => c.startsWith("cullFace"))).toBe(false);
  });

  it("separates alpha blending only when the state asks for it", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const state = BASE.map(
      ([s, v]): PackedStateCommand =>
        s === 206 ? [206, 1] : s === 207 ? [207, 2] : s === 208 ? [208, 1] : [s, v],
    );
    device.apply(compileDeviceState(state, "t"), program, locations);
    expect(calls).toContain("blendFuncSeparate 24,25,21,20");
  });

  it("sets everything again after invalidate", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const set = compileDeviceState(BASE, "t");
    device.apply(set, program, locations);
    device.invalidate();
    calls.length = 0;
    device.apply(set, program, locations);
    expect(calls).toContain("enable 1");
    expect(calls).toContain("uniform1i uAlphaFunc 5");
  });

  it("uploads the device uniforms once per program and again for a different program", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const set = compileDeviceState(BASE, "t");
    device.apply(set, program, locations);
    calls.length = 0;
    device.apply(set, {} as WebGLProgram, locations);
    expect(calls.filter((c) => c.startsWith("uniform"))).toEqual([
      "uniform1f uDepthBias 0",
      "uniform1i uAlphaTestEnabled 0",
      "uniform1i uAlphaFunc 5",
      "uniform1f uAlphaRef 0.09803921568627451",
    ]);
  });

  it("rejects a shader that lost a uniform its state needs", () => {
    const missing = new Map(locations);
    missing.set("uAlphaRef", null);
    const alphaTested = BASE.map(([s, v]): PackedStateCommand => (s === 15 ? [15, 1] : [s, v]));
    expect(() => assertDeviceUniforms(compileDeviceState(alphaTested, "t"), missing, "t")).toThrow(
      /alpha test uniforms/,
    );
    const biased = BASE.map(
      ([s, v]): PackedStateCommand => (s === 195 ? [195, 0x3f800000] : [s, v]),
    );
    const noBias = new Map(locations);
    noBias.set("uDepthBias", null);
    expect(() => assertDeviceUniforms(compileDeviceState(biased, "t"), noBias, "t")).toThrow(
      /depth bias uniform/,
    );
    expect(() => assertDeviceUniforms(compileDeviceState(BASE, "t"), noBias, "t")).not.toThrow();
  });

  it("does not touch the context or the set when the same set is applied to the same program", () => {
    const { gl, calls } = fakeGl();
    const device = createDeviceState(gl);
    const set = compileDeviceState(BASE, "t");
    device.apply(set, program, locations);
    calls.length = 0;
    device.apply(set, program, locations);
    expect(calls).toEqual([]);
    let reads = 0;
    const counted = {
      values: new Proxy(set.values, {
        get(target, key) {
          reads++;
          return Reflect.get(target, key);
        },
      }),
    } as typeof set;
    const other = {} as WebGLProgram;
    device.apply(counted, other, locations);
    const afterFirst = reads;
    device.apply(counted, other, locations);
    expect(reads).toBe(afterFirst);
  });

  it("re-applies what another tracker on the same context changed", () => {
    const { gl, calls } = fakeGl();
    const first = createDeviceState(gl);
    const second = createDeviceState(gl);
    const a = compileDeviceState(BASE, "a");
    const b = compileDeviceState(
      BASE.map(([s, v]): PackedStateCommand => (s === 22 ? [22, 3] : [s, v])),
      "b",
    );
    first.apply(a, program, locations);
    second.apply(b, program, locations);
    calls.length = 0;
    first.apply(a, program, locations);
    expect(calls).toContain("cullFace 5");
  });

  it("leaves the context in the applied state across random sequences with invalidation", () => {
    const next = random(3);
    const variants = Array.from({ length: 8 }, (_, i) =>
      compileDeviceState(
        BASE.map(([s, v]): PackedStateCommand => {
          if (s === 22) return [22, 1 + (i % 3)];
          if (s === 23) return [23, 1 + ((i * 3) % 8)];
          if (s === 14) return [14, i & 1];
          if (s === 168) return [168, (i * 5) & 15];
          if (s === 20) return [20, 1 + (i % 11)];
          if (s === 27) return [27, (i >> 1) & 1];
          if (s === 195) return [195, i < 4 ? 0x80000000 : 0x3f800000];
          return [s, v];
        }),
        `v${i}`,
      ),
    );
    const programs = [
      [{}, {}, {}],
      [{}, {}],
    ] as WebGLProgram[][];
    const world = statefulGl();
    const trackers = [createDeviceState(world.gl), createDeviceState(world.gl)];
    for (let step = 0; step < 4000; step++) {
      const r = next();
      if (r < 0.1) {
        trackers[Math.floor(next() * 2)].invalidate();
        world.clobber(next);
        continue;
      }
      const which = Math.floor(next() * 2);
      const tracker = trackers[which];
      const set = variants[Math.floor(next() * variants.length)];
      const target = programs[which][Math.floor(next() * programs[which].length)];
      world.use(target);
      tracker.apply(set, target, locations);
      world.expect(set.values, target);
    }
  });
});
