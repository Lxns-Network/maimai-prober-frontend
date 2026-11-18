import { describe, expect, it } from "vitest";
import {
  createEffectRenderer,
  type EffectFrame,
  type EffectBillboardPacket,
  type EffectParticlePacket,
  type EffectPrimitivePacket,
} from "./render";
import { effectStateCommands, particleEffectState, primitiveEffectState } from "./renderState";
import { effectShaders, effectProgramId } from "./shaders";

/** A WebGL2 stand-in that names every constant and records every call. */
function recordingGl() {
  const calls: string[] = [];
  let next = 1;
  const handles = new Map<string, number>();
  const name = (value: unknown): string => {
    if (value && typeof value === "object" && "handle" in value)
      return String((value as { handle: string }).handle);
    if (typeof value === "number") {
      for (const [key, id] of handles) if (id === value) return key;
      return String(value);
    }
    if (ArrayBuffer.isView(value)) return `[${(value as Float32Array).length}]`;
    return JSON.stringify(value);
  };
  const gl = new Proxy(
    {},
    {
      get(_, property: string) {
        if (/^[A-Z0-9_]+$/.test(property)) {
          if (!handles.has(property)) handles.set(property, 0x10000 + handles.size);
          return handles.get(property);
        }
        if (property === "getShaderParameter" || property === "getProgramParameter")
          return () => true;
        if (property === "getParameter") return () => 8;
        if (property === "getUniformLocation")
          return (_: unknown, uniform: string) => ({ handle: uniform });
        return (...args: unknown[]) => {
          if (property.startsWith("create")) return { handle: `${property.slice(6)}#${next++}` };
          calls.push(`${property}(${args.map(name).join(", ")})`);
          return undefined;
        };
      },
    },
  ) as WebGL2RenderingContext;
  return { gl, calls };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const SAMPLER = {
  addressU: 3,
  addressV: 3,
  minFilter: 2,
  magFilter: 2,
  mipFilter: 0,
  maxMipLevel: 0,
  maxAnisotropy: 1,
};

function context(flags = 0x2de004, features = 0x4020): number[] {
  const bytes = new Uint8Array(112);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, flags, true);
  view.setUint32(96, features, true);
  view.setFloat32(28, 0.5, true);
  view.setFloat32(32, 2, true);
  view.setFloat32(60, 0.25, true);
  view.setFloat32(64, 0.75, true);
  view.setFloat32(68, 3, true);
  return Array.from(bytes);
}

function primitive(overrides: Partial<EffectPrimitivePacket> = {}): EffectPrimitivePacket {
  const colors = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  return {
    kind: "simple",
    layout: 4,
    resourceId: 25,
    mesh: {
      attributes: {
        aPosition: { size: 3, values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
        aColor: { size: 4, values: colors },
        aTexCoord: { size: 2, values: [0, 0, 1, 0, 0, 1] },
      },
      indices: [0, 1, 2],
    },
    worldMatrix: IDENTITY,
    bindings: [{ resourceIndex: 0, sampler: SAMPLER }],
    material: {
      context: context(),
      fixedParam0: [1, 1, 1, 0],
      materialKey: [0x422090, 0],
      environmentIndex: 0,
    },
    order: { pass: { passIndex: 16 }, key: 0x8105, sortPosition: [0, 0, 0], sortDistanceOffset: 0 },
    ...overrides,
  };
}

function particle(first: number, count: number): EffectParticlePacket {
  const pool = 5;
  const tangents: number[] = [];
  for (let i = 0; i < pool; i++)
    for (let corner = 0; corner < 4; corner++) tangents.push(i, i + 0.5, i + 0.25, 100 + i);
  return {
    kind: "particle",
    resourceId: 23,
    mesh: { attributes: { aTangent: { size: 4, values: tangents } }, indices: [] },
    range: { firstIndex: first * 6, count: count * 6 },
    worldMatrix: IDENTITY,
    bindings: [{ resourceIndex: 0, sampler: SAMPLER }],
    sourceFlags: 0x2de004,
    parameters: new Float32Array(236),
    material: { fixedParam0: [0, 0, 1, 0] },
    order: { pass: { passIndex: 16 }, key: 0x8102, sortDistanceOffset: 0 },
  };
}

const frame = (): EffectFrame => ({
  viewport: { width: 1280, height: 720 },
  viewProjection: IDENTITY,
  projection: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1.5, -2.5, 0, 0, 0, 0],
  eyePosition: [1, 2, 3],
  depth: {
    primitive: (position, offset) => position[0] + offset + 1,
    model: (world, offset) => world[3] + offset + 2,
  },
});

const textures = { texture: () => ({ handle: "texture" }) as unknown as WebGLTexture };

describe("effect render state", () => {
  it("submits point sprites with their own pixel size across mixed primitive preparations", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const point = primitive({ topology: "points", pointSize: 7 });
    const second = primitive({ topology: "points", pointSize: 13.5 });
    const entries = renderer.prepare([point, primitive(), second], frame());
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call.startsWith("drawElements"))).toEqual([
      "drawElements(POINTS, 3, UNSIGNED_INT, 0)",
      "drawElements(TRIANGLES, 3, UNSIGNED_INT, 12)",
      "drawElements(POINTS, 3, UNSIGNED_INT, 24)",
    ]);
    expect(calls).toContain("uniform1f(uPointSize, 7)");
    expect(calls).toContain("uniform1f(uPointSize, 13.5)");
    calls.length = 0;
    renderer.prepare([primitive()], frame())[0].draw();
    expect(calls.some((call) => call.startsWith("uniform1f(uPointSize"))).toBe(false);
    expect(() => renderer.prepare([primitive({ topology: "points" })], frame())).toThrow(
      /pixel diameter/,
    );
    renderer.dispose();
  });

  it("selects fog per material and refreshes its environment between scene frames", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const fog = {
      mode: 2,
      range: [100, 0.02, 1, 0],
      height: [10, -10, 100, 0.01],
      color: [0.2, 0.3, 0.4],
    };
    const enabled = primitive();
    enabled.material = { ...enabled.material, context: context(0x2de004, 0x20) };
    enabled.state = primitiveEffectState(0x2de004, 0x4020);
    const shaderParticle = particle(0, 1);
    shaderParticle.material.fog = true;
    const billboard: EffectBillboardPacket = {
      ...enabled,
      kind: "billboard",
      instances: Float32Array.of(0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1),
    };
    const other = { ...frame(), fog: { ...fog, mode: 3, color: [0.6, 0.5, 0.4] } };
    const entries = renderer.prepare(
      [enabled, primitive(), shaderParticle, billboard, { ...enabled, frame: other }],
      { ...frame(), fog },
    );
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call === "uniform1i(uFogMode, 2)")).toHaveLength(3);
    expect(calls).toContain("uniform1i(uFogMode, 3)");
    expect(calls.filter((call) => call === "uniform3fv(uFogColor, [0.2,0.3,0.4])")).toHaveLength(3);
    expect(calls).toContain("uniform3fv(uFogColor, [0.6,0.5,0.4])");
    calls.length = 0;
    for (const entry of renderer.prepare([enabled, shaderParticle, billboard], frame()))
      entry.draw();
    expect(calls.some((call) => call.startsWith("uniform1i(uFogMode"))).toBe(false);
    renderer.dispose();
  });

  it("keeps instance offsets and vertex divisors independent across billboards and birth particles", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const base = primitive();
    const billboard: EffectBillboardPacket = {
      ...base,
      kind: "billboard",
      instances: Float32Array.of(0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1),
    };
    const births = particle(0, 1);
    (births.parameters as Float32Array)[2] = 1;
    births.births = Float32Array.of(1, 2, 3, 0, 0, 0, 1);
    const entries = renderer.prepare([billboard, births, primitive(), billboard], frame());
    expect(calls).toContain("bufferSubData(ARRAY_BUFFER, 0, [4096], 0, 41)");
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call.startsWith("vertexAttribPointer"))).toEqual([
      "vertexAttribPointer(0, 3, FLOAT, false, 60, 0)",
      "vertexAttribPointer(1, 4, FLOAT, false, 60, 12)",
      "vertexAttribPointer(2, 4, FLOAT, false, 60, 44)",
      "vertexAttribPointer(3, 4, FLOAT, false, 60, 28)",
      "vertexAttribPointer(0, 4, FLOAT, false, 44, 60)",
      "vertexAttribPointer(1, 3, FLOAT, false, 44, 76)",
      "vertexAttribPointer(2, 4, FLOAT, false, 44, 88)",
      "vertexAttribPointer(0, 3, FLOAT, false, 60, 104)",
      "vertexAttribPointer(1, 4, FLOAT, false, 60, 116)",
      "vertexAttribPointer(2, 4, FLOAT, false, 60, 148)",
      "vertexAttribPointer(3, 4, FLOAT, false, 60, 132)",
    ]);
    expect(calls.filter((call) => call.startsWith("draw"))).toEqual([
      "drawArraysInstanced(TRIANGLES, 0, 6, 1)",
      "drawElementsInstanced(TRIANGLES, 6, UNSIGNED_BYTE, 0, 1)",
      "drawElements(TRIANGLES, 3, UNSIGNED_INT, 0)",
      "drawArraysInstanced(TRIANGLES, 0, 6, 1)",
    ]);
    billboard.instances = new Float32Array(14);
    expect(() => renderer.prepare([billboard], frame())).toThrow(/vertex layout/);
    renderer.dispose();
    expect(calls.filter((call) => call.startsWith("deleteVertexArray"))).toHaveLength(3);
  });

  it("keeps each packet's camera and sort depth when different scopes share one shader", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const first = frame(),
      second = frame();
    second.depth = { primitive: () => 42, model: () => 42 };
    const a = primitive({ frame: first }),
      b = primitive({ frame: second });
    const entries = renderer.prepare([a, b, a], first);
    expect(entries.map((entry) => entry.depth)).toEqual([1, 42, 1]);
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(
      calls.filter((call) => call.startsWith("uniformMatrix4fv(uViewProjection")),
    ).toHaveLength(3);
    renderer.dispose();
  });
  it("switches normal billboard strides and lighting alongside ordinary effects", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const base = primitive();
    const billboard: EffectBillboardPacket = {
      ...base,
      kind: "billboard",
      instances: Float32Array.of(0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1),
    };
    const lit: EffectBillboardPacket = {
      ...billboard,
      instances: Float32Array.of(...billboard.instances, -2 / 3, 2 / 3, 1 / 3),
      normalLights: [{ direction: [1, 0, 0], diffuse: [0.7, 0.5, 0.2] }],
    };
    const entries = renderer.prepare([lit, billboard, particle(0, 1), lit], frame());
    calls.length = 0;
    entries.forEach((entry) => entry.draw());
    expect(calls.filter((call) => /^(enable|disable)VertexAttribArray\(4\)/.test(call))).toEqual([
      "enableVertexAttribArray(4)",
      "disableVertexAttribArray(4)",
      "enableVertexAttribArray(4)",
    ]);
    expect(calls).toContain("vertexAttribPointer(4, 3, FLOAT, false, 72, 60)");
    expect(calls).toContain("vertexAttribPointer(4, 3, FLOAT, false, 72, 208)");
    expect(calls.filter((call) => call === "uniform3fv(uParallelDirection[0], [3])")).toHaveLength(
      2,
    );
    expect(() => renderer.prepare([{ ...lit, instances: billboard.instances }], frame())).toThrow(
      /vertex layout/,
    );
    renderer.dispose();
  });
  it("compiles every listed class and rejects the rest", () => {
    const listed = effectStateCommands();
    for (const entry of listed.primitives)
      expect(primitiveEffectState(entry.flags, entry.features).values[20]).toBe(
        entry.commands.find(([state]) => state === 20)![1],
      );
    for (const entry of listed.particles)
      expect(particleEffectState(entry.flags).values[24]).toBe(0);
    expect(() => primitiveEffectState(0x2de005, 0x4020)).toThrow(RangeError);
    expect(() => particleEffectState(0x2de003)).toThrow(RangeError);
  });

  it("blends additively for blend 4 and by alpha for blend 3, depth-tested without depth writes", () => {
    const additive = primitiveEffectState(0x2de004, 0x4020).values;
    const alpha = primitiveEffectState(0x2de003, 0x4020).values;
    expect([additive[19], additive[20]]).toEqual([5, 2]);
    expect([alpha[19], alpha[20]]).toEqual([5, 6]);
    expect([additive[7], additive[14], additive[23], additive[22]]).toEqual([1, 0, 4, 1]);
  });
});

describe("effect shaders", () => {
  it("differ by the fields of the key and share an id only when the key is equal", () => {
    const base = {
      particle: false,
      softEdge: false,
      textures: 1,
      blend0: 0,
      blend1: 0,
      separateUv: false,
      uniformColor: false,
      parallelLights: 0,
    };
    const ids = new Set<number>();
    for (const change of [
      {},
      { particle: true },
      { softEdge: true },
      { textures: 2 },
      { blend0: 6 },
      { blend1: 3 },
      { separateUv: true },
      { uniformColor: true },
      { parallelLights: 1 },
      { shadow: true },
      { billboard: true },
      { refraction: true },
    ])
      ids.add(effectProgramId({ ...base, ...change }));
    expect(ids.size).toBe(12);
    expect(effectShaders({ ...base, softEdge: true }).fragment).toContain("effectSoftEdge(");
    expect(effectShaders(base).fragment).not.toContain("effectSoftEdge(color");
    expect(effectShaders({ ...base, textures: 0 }).fragment).toContain("vec4 color = vec4(1.0)");
    expect(effectShaders({ ...base, textures: 0 }).fragment).not.toContain(
      "vec4 color = texture(uTexture0",
    );
    expect(effectShaders({ ...base, textures: 2, blend0: 6 }).fragment).toContain(
      "multiTexBlend(texture(uTexture1, vUv1), color, 6)",
    );
    expect(effectShaders({ ...base, uniformColor: true }).vertex).toContain(
      "uniform vec4 uEffectColor",
    );
    expect(effectShaders({ ...base, particle: true }).vertex).toContain("uParticles[0]");
    const lit = effectShaders({ ...base, parallelLights: 2 }).vertex;
    expect(lit).toContain("mat3(uWorld) * aNormal");
    expect(lit).toContain("dot(normal, uParallelDirection[i]) * 0.5 + 0.5");
    expect(lit).toContain("diffuse += light * light * uParallelDiffuse[i]");
    expect(lit).not.toContain("normalize(");
  });
});

describe("createEffectRenderer", () => {
  it("prepares shader variants before playback and reuses them without compiling", async () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const key = {
      particle: false,
      softEdge: false,
      textures: 1,
      blend0: 0,
      blend1: 0,
      separateUv: false,
      uniformColor: true,
      parallelLights: 0,
    };
    await renderer.warm([key, key]);
    expect(calls.filter((call) => call.startsWith("linkProgram("))).toHaveLength(1);
    calls.length = 0;
    renderer.prepare([primitive()], frame())[0].draw();
    await renderer.warm([key]);
    expect(
      calls.some((call) => call.startsWith("compileShader(") || call.startsWith("linkProgram(")),
    ).toBe(false);
    renderer.dispose();
  });

  it("reuses consecutive draw state and restores it after external rendering", () => {
    const { gl, calls } = recordingGl();
    let epoch = 1;
    const renderer = createEffectRenderer(gl, textures, () => epoch);
    const entries = renderer.prepare([primitive(), primitive(), primitive()], frame());
    expect(entries[0].source).toBe(entries[1].source);
    calls.length = 0;
    entries[0].draw();
    const first = calls.filter((call) => call.startsWith("blendFuncSeparate("));
    expect(first).toHaveLength(1);
    calls.length = 0;
    entries[1].draw();
    expect(calls.filter((call) => call.startsWith("blendFuncSeparate("))).toHaveLength(0);
    epoch++;
    calls.length = 0;
    entries[2].draw();
    expect(calls.filter((call) => call.startsWith("blendFuncSeparate("))).toEqual(first);
    renderer.dispose();
  });
  it("submits camera wireframes as lines without changing triangle packets", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const entries = renderer.prepare([primitive({ topology: "lines" }), primitive()], frame());
    calls.length = 0;
    entries.forEach((entry) => entry.draw());
    expect(calls.filter((call) => call.startsWith("drawElements("))).toEqual([
      "drawElements(LINES, 3, UNSIGNED_INT, 0)",
      "drawElements(TRIANGLES, 3, UNSIGNED_INT, 12)",
    ]);
    renderer.dispose();
  });
  it("returns one entry per drawable packet with the packet's pass, key and depth", () => {
    const { gl } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const entries = renderer.prepare(
      [
        primitive(),
        primitive({ sceneMask: 2 }),
        primitive({
          order: {
            pass: { passIndex: 12 },
            key: 7,
            sortPosition: [4, 0, 0],
            sortDistanceOffset: 2,
          },
        }),
        particle(1, 2),
      ],
      frame(),
    );
    expect(entries.map((entry) => [entry.pass, entry.key, entry.depth])).toEqual([
      [16, 0x8105, 1],
      [12, 7, 7],
      [16, 0x8102, 2],
    ]);
    expect(entries.every((entry) => !entry.requiresDepthSnapshot)).toBe(true);
  });

  it("packs primitives into one buffer and draws each from its own index range", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const entries = renderer.prepare([primitive(), primitive()], frame());
    const uploads = calls.filter((call) => call.startsWith("bufferSubData"));
    expect(uploads).toEqual([
      "bufferSubData(ARRAY_BUFFER, 0, [57344], 0, 84)",
      "bufferSubData(ELEMENT_ARRAY_BUFFER, 0, [8192], 0, 6)",
    ]);
    calls.length = 0;
    for (const entry of entries) expect(entry.draw()).toEqual({ draws: 1 });
    expect(calls.filter((call) => call.startsWith("drawElements"))).toEqual([
      "drawElements(TRIANGLES, 3, UNSIGNED_INT, 0)",
      "drawElements(TRIANGLES, 3, UNSIGNED_INT, 12)",
    ]);
  });

  it("selects and submits the normal shader per draw without leaking the prior light set", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const base = primitive();
    const lit: EffectPrimitivePacket = {
      ...base,
      layout: 10,
      mesh: {
        ...base.mesh,
        attributes: {
          ...base.mesh.attributes,
          aNormal: { size: 3, values: [0, 0, 1, 0, 0, 1, 0, 0, 1] },
        },
      },
      normalLights: [
        { direction: [0, 0, 1], diffuse: [1, 0.5, 0.25] },
        { direction: [1, 0, 0], diffuse: [0.1, 0.2, 0.3] },
      ],
    };
    const entries = renderer.prepare([lit, { ...lit, normalLights: [] }, lit], frame());
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call === "uniform3fv(uParallelDirection[0], [6])")).toHaveLength(
      2,
    );
    expect(calls.filter((call) => call === "uniform3fv(uParallelDiffuse[0], [6])")).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith("drawElements"))).toHaveLength(3);
    expect(() => renderer.prepare([{ ...lit, normalLights: undefined }], frame())).toThrow(
      /streams disagree/,
    );
    expect(() =>
      renderer.prepare([{ ...lit, normalLights: Array(4).fill(lit.normalLights![0]) }], frame()),
    ).toThrow(/at most three/);
    renderer.dispose();
  });

  it("binds the shared cascades only for shadow-receiving primitives and particles", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const shadow = {
      matrices: [IDENTITY, IDENTITY],
      textures: [{ handle: "near-shadow" }, { handle: "far-shadow" }] as unknown as WebGLTexture[],
      color: [0.2, 0.3, 0.4],
    };
    const receiver = primitive();
    receiver.material = { ...receiver.material, context: context(0x2de004, 0x4028) };
    receiver.state = primitiveEffectState(0x2de004, 0x4020);
    receiver.shadow = true;
    const entries = renderer.prepare(
      [receiver, { ...particle(0, 1), shadow: true }, { ...primitive(), shadow: true }],
      { ...frame(), shadow },
    );
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call === "bindTexture(TEXTURE_2D, near-shadow)")).toHaveLength(2);
    expect(calls.filter((call) => call === "bindTexture(TEXTURE_2D, far-shadow)")).toHaveLength(4);
    expect(calls.filter((call) => call === "uniform3fv(uShadowColor, [0.2,0.3,0.4])")).toHaveLength(
      2,
    );
    expect(() => renderer.prepare([receiver], frame())).toThrow(/needs its frame shadow maps/);
    expect(() => renderer.prepare([{ ...primitive(), shadow: true }], frame())).not.toThrow();
    renderer.dispose();
  });

  it("binds one and three cascade frames without sampling a stale map", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    for (const count of [1, 3, 1]) {
      const shadow = {
        matrices: Array.from({ length: count }, () => IDENTITY),
        textures: Array.from({ length: count }, (_, i) => ({
          handle: `cascade-${i}`,
        })) as unknown as WebGLTexture[],
        color: [0.2, 0.3, 0.4],
        edgeHide: count === 3,
        softness: count === 3 ? 2 : 0,
      };
      const receiver = primitive();
      receiver.material = { ...receiver.material, context: context(0x2de004, 0x4028) };
      receiver.state = primitiveEffectState(0x2de004, 0x4020);
      const [entry] = renderer.prepare([{ ...receiver, shadow: true }], { ...frame(), shadow });
      calls.length = 0;
      entry.draw();
      expect(calls).toContain(`uniform1i(uShadowCascadeCount, ${count})`);
      expect(calls).toContain(`uniform1i(uShadowEdgeHide, ${count === 3 ? 1 : 0})`);
      expect(calls).toContain(`uniform1i(uShadowSoftness, ${count === 3 ? 2 : 0})`);
      expect(calls.filter((call) => call.startsWith("bindTexture(TEXTURE_2D, cascade-"))).toEqual(
        [0, 1, 2].map((i) => `bindTexture(TEXTURE_2D, cascade-${Math.min(i, count - 1)})`),
      );
    }
    renderer.dispose();
  });

  it("applies the class state, texture units and per-draw uniforms", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const [entry] = renderer.prepare([primitive()], frame());
    calls.length = 0;
    entry.draw();
    expect(calls).toContain("blendFuncSeparate(SRC_ALPHA, ONE, SRC_ALPHA, ONE)");
    expect(calls).toContain("depthMask(false)");
    expect(calls).toContain("depthFunc(LEQUAL)");
    expect(calls).toContain("uniform4fv(uVertexParam0, [4])");
    expect(calls).toContain("uniform4fv(uEffectColor, [4])");
    expect(calls.some((call) => /^bindSampler\(0, Sampler#\d+\)$/.test(call))).toBe(true);
    expect(calls.indexOf("bindVertexArray(null)")).toBe(calls.length - 1);
  });

  it("draws particles instanced from the run's own births", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const entries = renderer.prepare([particle(1, 2), particle(3, 2)], frame());
    expect(calls.filter((call) => call.startsWith("bufferSubData"))).toContain(
      "bufferSubData(ARRAY_BUFFER, 0, [4096], 0, 16)",
    );
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call.startsWith("drawElementsInstanced"))).toEqual([
      "drawElementsInstanced(TRIANGLES, 6, UNSIGNED_BYTE, 0, 2)",
      "drawElementsInstanced(TRIANGLES, 6, UNSIGNED_BYTE, 0, 2)",
    ]);
    expect(calls.filter((call) => call.startsWith("vertexAttribPointer"))).toEqual([
      "vertexAttribPointer(0, 4, FLOAT, false, 0, 0)",
      "vertexAttribPointer(0, 4, FLOAT, false, 0, 32)",
    ]);
    expect(calls).toContain("uniform4fv(uParticles[0], [236])");
  });

  it("uploads birth transforms alongside tangents for world-space particles", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const world = particle(1, 2);
    (world.parameters as Float32Array)[2] = 2;
    world.births = Float32Array.of(4, 5, 6, 0, 0, 0, 1, 7, 8, 9, 0, 0, 0, 1);
    const entries = renderer.prepare([world, particle(0, 1)], frame());
    expect(calls).toContain("bufferSubData(ARRAY_BUFFER, 0, [4096], 0, 26)");
    calls.length = 0;
    for (const entry of entries) entry.draw();
    expect(calls.filter((call) => call.startsWith("vertexAttribPointer"))).toEqual([
      "vertexAttribPointer(0, 4, FLOAT, false, 44, 0)",
      "vertexAttribPointer(1, 3, FLOAT, false, 44, 16)",
      "vertexAttribPointer(2, 4, FLOAT, false, 44, 28)",
      "vertexAttribPointer(0, 4, FLOAT, false, 0, 88)",
    ]);
    expect(calls).toContain("disableVertexAttribArray(1)");
    expect(calls).toContain("disableVertexAttribArray(2)");
  });

  it("asks soft-edge entries for the depth snapshot and binds it after the colour units", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const soft = primitive({
      material: {
        context: context(0x2de004, 0x4420),
        fixedParam0: [0.5, 0, 1, 0],
        materialKey: [0x422091, 0],
        environmentIndex: 1,
      },
    });
    const [entry] = renderer.prepare([soft], frame());
    expect(entry.requiresDepthSnapshot).toBe(true);
    expect(() => entry.draw()).toThrow(/depth snapshot/);
    calls.length = 0;
    const depth = { texture: { handle: "depthTexture" }, sampler: { handle: "depthSampler" } };
    entry.draw({ depth: depth as never });
    expect(calls).toContain("bindTexture(TEXTURE_2D, depthTexture)");
    expect(calls).toContain("bindSampler(3, depthSampler)");
    expect(calls).toContain("uniform4fv(uSystemParam, [4])");
    expect(calls).toContain("uniform1i(uDepthFlipY, 1)");
    expect(calls).toContain("uniform4fv(uDepthUvTransform, [1,1,0,0])");
    const [scoped] = renderer.prepare(
      [{ ...soft, frame: { ...frame(), depthUvTransform: [0.5, 0.5, 0.25, 0.125] } }],
      frame(),
    );
    calls.length = 0;
    scoped.draw({ depth: depth as never });
    expect(calls).toContain("uniform4fv(uDepthUvTransform, [0.5,0.5,0.25,0.125])");
  });

  it("requires the separate scene color for refractive particles and resets on reuse", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const packet = particle(0, 1);
    packet.material.refraction = true;
    const [entry] = renderer.prepare([packet], frame());
    expect(entry.requiresColorSnapshot).toBe(true);
    expect(entry.requiresDepthSnapshot).toBe(false);
    expect(() => entry.draw()).toThrow(/color snapshot/);
    calls.length = 0;
    entry.draw({
      depth: null,
      color: { texture: { handle: "sceneColor" }, sampler: { handle: "sceneSampler" } } as never,
    });
    expect(calls).toContain("bindTexture(TEXTURE_2D, sceneColor)");
    expect(calls).toContain("bindSampler(4, sceneSampler)");
    packet.material.refraction = false;
    const [plain] = renderer.prepare([packet], frame());
    expect(plain.requiresColorSnapshot).toBe(false);
    expect(() => plain.draw()).not.toThrow();
  });

  it("reuses its entries and rejects a draw from an earlier preparation", () => {
    const { gl } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    const first = renderer.prepare([primitive()], frame())[0];
    const stale = first.draw;
    const second = renderer.prepare([primitive()], frame())[0];
    expect(second).toBe(first);
    renderer.prepare([], frame());
    expect(() => stale()).toThrow(/expired/);
  });

  it("rejects a missing texture, an unsupported sampler and a material outside the classes", () => {
    const { gl } = recordingGl();
    const missing = createEffectRenderer(gl, { texture: () => null });
    expect(() => missing.prepare([primitive()], frame())).toThrow(/not loaded/);
    const renderer = createEffectRenderer(gl, textures);
    expect(() =>
      renderer.prepare(
        [primitive({ bindings: [{ resourceIndex: 0, sampler: { ...SAMPLER, minFilter: 3 } }] })],
        frame(),
      ),
    ).toThrow(RangeError);
    expect(() =>
      renderer.prepare(
        [primitive({ material: { ...primitive().material, context: context(0x2de005) } })],
        frame(),
      ),
    ).toThrow(/not supported/);
  });

  it("deletes what it created", () => {
    const { gl, calls } = recordingGl();
    const renderer = createEffectRenderer(gl, textures);
    renderer.prepare([primitive(), particle(0, 1)], frame());
    calls.length = 0;
    renderer.dispose();
    expect(calls.filter((call) => call.startsWith("deleteProgram"))).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith("deleteBuffer"))).toHaveLength(4);
    expect(() => renderer.prepare([], frame())).toThrow(/disposed/);
  });
});
