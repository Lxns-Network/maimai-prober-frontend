import { describe, expect, it } from "vitest";
import { createStagePost } from "./stagePost";
import { MLAA_BLEND_SHADER, MLAA_EDGE_SHADER, mlaaWeightShader } from "./stageMlaa";
import { FXAA3_SHADER } from "./stageFxaa3";
import type { StagePostFilter } from "../../nodes/filters";
import type { StageBloom } from "../../nodes/bloom";
import type { StageBloom2 } from "../../nodes/bloom2";
import type { StageCameraLook } from "../../view";
function recordingGl(incompleteAt = 0, scissor = false) {
  const events: string[] = [];
  const calls: {
    name: string;
    args: unknown[];
    result?: unknown;
  }[] = [];
  const names = new Map<unknown, string>();
  let next = 1;
  let checks = 0;
  const make = (kind: string) => {
    const handle = { kind, id: next++ };
    names.set(handle, `${kind}${handle.id}`);
    return handle;
  };
  let bound = "screen";
  let viewport = "";
  let unit = 0;
  const units = new Map<number, string | undefined>();
  const attached = new Map<string, string>();
  const depthAttached = new Map<string, string>();
  const draws: {
    target: string;
    size: string;
    input: string | undefined;
    inputs: (string | undefined)[];
  }[] = [];
  const constants = new Map<string, number>();
  const constant = (name: string) => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const gl = new Proxy({} as WebGL2RenderingContext, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(prop)) return constant(prop);
      return (...args: unknown[]) => {
        const call: (typeof calls)[number] = { name: prop, args };
        calls.push(call);
        if (prop.startsWith("create")) return (call.result = make(prop.slice(6).toLowerCase()));
        if (prop === "getShaderParameter" || prop === "getProgramParameter") return true;
        if (prop === "checkFramebufferStatus")
          return ++checks === incompleteAt ? 0 : constant("FRAMEBUFFER_COMPLETE");
        if (prop === "getExtension") return {};
        if (prop === "isEnabled") return args[0] === constant("SCISSOR_TEST") && scissor;
        if (prop === "getUniformLocation") return { name: args[1] };
        if (prop === "bindFramebuffer") bound = args[1] === null ? "screen" : names.get(args[1])!;
        if (prop === "viewport") viewport = `${args[2]}x${args[3]}`;
        if (prop === "activeTexture") unit = (args[0] as number) - constant("TEXTURE0");
        if (prop === "bindTexture") units.set(unit, names.get(args[1]));
        if (prop === "framebufferTexture2D") {
          const attachments =
            args[1] === constant("DEPTH_STENCIL_ATTACHMENT") ? depthAttached : attached;
          attachments.set(bound, names.get(args[3])!);
        }
        if (prop === "framebufferRenderbuffer") depthAttached.set(bound, names.get(args[3])!);
        if (prop === "drawArrays") {
          events.push(bound);
          draws.push({
            target: bound,
            size: viewport,
            input: units.get(0),
            inputs: Array.from({ length: 4 }, (_, index) => units.get(index)),
          });
        }
        return undefined;
      };
    },
  });
  return { gl, events, calls, draws, attached, depthAttached, bound: () => bound };
}
const solid = (
  extra: Partial<StagePostFilter> & {
    kind: StagePostFilter["kind"];
  },
) => extra as StagePostFilter;
describe("stage post chain", () => {
  it("preserves HDR colour in the scene and filter scratch targets", () => {
    const { gl, calls } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    post.end([solid({ kind: "fxaa3", pass: 20, fxaa3: { pass: 20, repeat: true } })], null);
    const colorTargets = calls.filter((call) => call.name === "texStorage2D");
    expect(colorTargets).toHaveLength(2);
    expect(colorTargets.every((call) => call.args[2] === gl.RGBA16F)).toBe(true);
    post.dispose();
  });
  const dof: StagePostFilter = {
    kind: "dof",
    pass: 20,
    dof: {
      pass: 20,
      autofocus: true,
      focusNoBlur: false,
      divisor: 4,
      values: Float32Array.of(1000, 1000, 0, 1000, 0, 100000),
    },
  };
  const camera: StageCameraLook = {
    position: [0, 0, 0],
    target: [0, 0, -1],
    up: [0, 1, 0],
    fovDegrees: 60,
    aspect: 16 / 9,
    parallel: false,
    view: new Float32Array(16),
    projection: new Float32Array(16),
    viewProjection: new Float32Array(16),
  };
  const frame = (filters: StagePostFilter[]) => {
    const { gl, events } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    events.length = 0;
    post.end(filters, null);
    return [...events];
  };
  it("anti-aliasing draws its three passes and ends in the destination", () => {
    const events = frame([
      solid({ kind: "mlaa", pass: 20, mlaa: { pass: 20, distance: 33, threshold: 0.1 } }),
    ]);
    expect(events).toHaveLength(3);
    expect(events[0]).not.toBe("screen");
    expect(events[1]).not.toBe("screen");
    expect(events[0]).not.toBe(events[1]);
    expect(events[2]).toBe("screen");
  });
  it("edge smoothing draws once into the destination", () => {
    const events = frame([solid({ kind: "fxaa3", pass: 20, fxaa3: { pass: 20, repeat: false } })]);
    expect(events).toEqual(["screen"]);
  });
  it("repeated edge smoothing reads its first result before writing the destination", () => {
    const { gl, draws, attached } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    post.end([solid({ kind: "fxaa3", pass: 20, fxaa3: { pass: 20, repeat: true } })], null);
    expect(draws).toHaveLength(2);
    expect(draws[0].target).not.toBe("screen");
    expect(draws[1].target).toBe("screen");
    expect(draws[1].input).toBe(attached.get(draws[0].target));
    expect(draws[0].input).not.toBe(draws[1].input);
  });
  it("a filter that is not last writes to the other surface and the next one reads it", () => {
    const events = frame([
      solid({ kind: "fxaa3", pass: 20, fxaa3: { pass: 20, repeat: false } }),
      solid({
        kind: "color2",
        pass: 20,
        color2: {
          enabled: true,
          colorSaturation: Float32Array.of(1, 1, 1, 1),
          brightnessContrastGammaPower: Float32Array.of(0, 1, 1, 1),
        },
      }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).not.toBe("screen");
    expect(events[1]).toBe("screen");
  });
  it("draws what comes after the filters into the filtered image, then copies it to the destination", () => {
    const { gl, events, depthAttached, bound } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    const sceneDepth = depthAttached.get(bound());
    expect(sceneDepth).toBeDefined();
    events.length = 0;
    post.end(
      [
        solid({
          kind: "color2",
          pass: 20,
          color2: {
            enabled: true,
            colorSaturation: Float32Array.of(1, 1, 1, 1),
            brightnessContrastGammaPower: Float32Array.of(0, 1, 1, 1),
          },
        }),
      ],
      null,
      () => gl.drawArrays(gl.TRIANGLES, 0, 3),
    );
    expect(events).toHaveLength(3);
    expect(events[0]).not.toBe("screen");
    expect(events[1]).toBe(events[0]);
    expect(events[2]).toBe("screen");
    expect(depthAttached.get(events[1])).toBe(sceneDepth);
  });
  it("runs the depth-of-field chain between filters without sampling an attached target", () => {
    const { gl, calls, draws, attached, depthAttached, bound } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    const sceneTarget = bound();
    const sceneDepth = depthAttached.get(sceneTarget);
    draws.length = 0;
    post.end(
      [
        solid({ kind: "fxaa3", pass: 19, fxaa3: { pass: 19, repeat: false } }),
        dof,
        solid({ kind: "fxaa3", pass: 21, fxaa3: { pass: 21, repeat: false } }),
      ],
      null,
      () => gl.drawArrays(gl.TRIANGLES, 0, 3),
      camera,
    );
    expect(calls.filter((call) => call.name === "blitFramebuffer")).toHaveLength(1);
    expect(draws).toHaveLength(11);
    expect(draws.slice(1, 6).map((draw) => draw.size)).toEqual(Array(5).fill("16x9"));
    expect(draws[1].input).toBe(attached.get(draws[0].target));
    expect(draws[6].input).toBe(attached.get(draws[0].target));
    expect(draws[7].input).toBe(attached.get(draws[6].target));
    expect(draws[8].input).toBe(attached.get(draws[7].target));
    for (const draw of draws.slice(0, 9))
      expect(draw.inputs).not.toContain(attached.get(draw.target));
    expect(draws[9].target).toBe(draws[8].target);
    expect(depthAttached.get(draws[9].target)).toBe(sceneDepth);
    expect(draws[10].target).toBe("screen");
    post.dispose();
  });
  it("requires a camera when depth-of-field is present", () => {
    const { gl } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    expect(() => post.end([dof], null)).toThrow(/camera is unavailable/);
    post.dispose();
  });
  it("uses the nearest depth sampler and releases the depth-of-field targets on resize", () => {
    const { gl, calls } = recordingGl();
    const post = createStagePost(gl);
    const persistentTargets = calls
      .filter((call) => call.name === "createTexture" || call.name === "createFramebuffer")
      .map((call) => call.result);
    post.begin(64, 36);
    post.end([dof], null, undefined, camera);
    expect(calls.filter((call) => call.name === "texStorage2D" && call.args[3] === 16)).toEqual(
      Array.from({ length: 3 }, () => ({
        name: "texStorage2D",
        args: [gl.TEXTURE_2D, 1, gl.RGBA16F, 16, 9],
      })),
    );
    const nearestDepth = calls
      .filter(
        (call) =>
          call.name === "samplerParameteri" &&
          call.args[1] === gl.TEXTURE_MAG_FILTER &&
          call.args[2] === gl.NEAREST,
      )
      .map((call) => call.args[0]);
    expect(nearestDepth.length).toBeGreaterThan(0);
    expect(
      calls.some(
        (call) =>
          call.name === "bindSampler" && call.args[0] === 1 && nearestDepth.includes(call.args[1]),
      ),
    ).toBe(true);
    const oldTargets = calls
      .filter((call) => call.name === "createTexture" || call.name === "createFramebuffer")
      .map((call) => call.result)
      .filter((target) => !persistentTargets.includes(target));
    post.begin(32, 16);
    post.end([dof], null, undefined, camera);
    for (const target of oldTargets)
      expect(
        calls.filter((call) => call.name.startsWith("delete") && call.args[0] === target),
      ).toHaveLength(1);
    post.dispose();
    const created = calls
      .filter((call) => call.name === "createTexture" || call.name === "createFramebuffer")
      .map((call) => call.result);
    for (const target of created)
      expect(
        calls.filter((call) => call.name.startsWith("delete") && call.args[0] === target),
      ).toHaveLength(1);
  });
  it("releases a partially allocated scene and retries it", () => {
    const { gl, calls } = recordingGl(1);
    const post = createStagePost(gl);
    const before = calls.length;
    expect(() => post.begin(64, 36)).toThrow(/incomplete/);
    for (const name of ["Texture", "Framebuffer", "Renderbuffer"]) {
      const operations = calls.slice(before);
      expect(operations.filter((call) => call.name === `create${name}`)).toHaveLength(1);
      expect(
        operations.filter((call) => call.name === `delete${name}` && call.args[0]),
      ).toHaveLength(1);
    }
    const afterFailure = calls.length;
    expect(() => post.begin(64, 36)).not.toThrow();
    post.dispose();
    for (const name of ["Texture", "Framebuffer", "Renderbuffer"]) {
      const created = calls.slice(afterFailure).find((call) => call.name === `create${name}`);
      expect(created).toBeDefined();
      expect(
        calls
          .slice(afterFailure)
          .filter((call) => call.name === `delete${name}` && call.args[0] === created!.result),
      ).toHaveLength(1);
    }
  });
  it("reuses the depth buffer at a fixed size and replaces it on resize", () => {
    const { gl, calls, depthAttached, bound } = recordingGl();
    const post = createStagePost(gl);
    post.begin(64, 36);
    const first = depthAttached.get(bound());
    post.begin(64, 36);
    expect(depthAttached.get(bound())).toBe(first);
    post.begin(32, 18);
    expect(depthAttached.get(bound())).not.toBe(first);
    expect(calls.filter((call) => call.name === "createRenderbuffer")).toHaveLength(2);
    expect(calls.filter((call) => call.name === "deleteRenderbuffer" && call.args[0])).toHaveLength(
      1,
    );
    post.dispose();
    expect(calls.filter((call) => call.name === "deleteRenderbuffer" && call.args[0])).toHaveLength(
      2,
    );
  });
  it("copies depth on demand and reuses the detached snapshot until resize", () => {
    const { gl, calls, bound, depthAttached } = recordingGl(0, true);
    const post = createStagePost(gl);
    post.begin(64, 36);
    const scene = bound();
    const sceneDepth = depthAttached.get(scene);
    const depth = post.snapshotDepth();
    expect(depthAttached.get(bound())).toBe(sceneDepth);
    const textureCreates = calls.filter((call) => call.name === "createTexture").length;
    expect(post.snapshotDepth()).toBe(depth);
    expect(calls.filter((call) => call.name === "createTexture")).toHaveLength(textureCreates);
    expect(
      calls.filter((call) => call.name === "blitFramebuffer").map((call) => call.args),
    ).toEqual([
      [0, 0, 64, 36, 0, 0, 64, 36, gl.DEPTH_BUFFER_BIT, gl.NEAREST],
      [0, 0, 64, 36, 0, 0, 64, 36, gl.DEPTH_BUFFER_BIT, gl.NEAREST],
    ]);
    const blit = calls.findIndex((call) => call.name === "blitFramebuffer");
    const disable = calls.findIndex(
      (call) => call.name === "disable" && call.args[0] === gl.SCISSOR_TEST,
    );
    const enable = calls.findIndex(
      (call) => call.name === "enable" && call.args[0] === gl.SCISSOR_TEST,
    );
    expect(disable).toBeGreaterThanOrEqual(0);
    expect(disable).toBeLessThan(blit);
    expect(enable).toBeGreaterThan(blit);
    post.begin(32, 18);
    expect(
      calls.filter((call) => call.name === "deleteTexture" && call.args[0] === depth),
    ).toHaveLength(1);
    expect(post.snapshotDepth()).not.toBe(depth);
    post.dispose();
    expect(
      calls.filter((call) => call.name === "deleteTexture" && call.args[0] === depth),
    ).toHaveLength(1);
  });
  it("releases an incomplete depth snapshot and retries without rebuilding the scene", () => {
    const { gl, calls, bound } = recordingGl(2);
    const post = createStagePost(gl);
    post.begin(64, 36);
    const scene = bound();
    expect(() => post.snapshotDepth()).toThrow(/depth snapshot is incomplete/);
    const textures = calls.filter((call) => call.name === "createTexture");
    const framebuffers = calls.filter((call) => call.name === "createFramebuffer");
    const failedTexture = textures[textures.length - 1].result;
    const failedFramebuffer = framebuffers[framebuffers.length - 1].result;
    expect(
      calls.filter((call) => call.name === "deleteTexture" && call.args[0] === failedTexture),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (call) => call.name === "deleteFramebuffer" && call.args[0] === failedFramebuffer,
      ),
    ).toHaveLength(1);
    expect(post.snapshotDepth()).not.toBe(failedTexture);
    expect(bound()).toBe(scene);
    expect(calls.filter((call) => call.name === "createRenderbuffer")).toHaveLength(1);
    post.dispose();
  });
});
describe("stage glow at other canvas sizes", () => {
  const bloom: StageBloom = {
    glow: true,
    range: 1,
    intensity: 1,
    attenuation: 1,
    shift: Float32Array.of(0, 0, 0, 0),
    starCount: 4,
    starRotation: 45,
    starRange: 1,
    starIntensity: 1,
    starLength: 1.5,
    starAttenuation: 1,
    starShift: Float32Array.of(0, 0, 0, 0),
  };
  const bloom2: StageBloom2 = {
    pass: 10,
    toneMode: 1,
    blueShift: false,
    starCount: 0,
    starRotation: 0,
    starLength: 1,
    starRetinaRatio: 0,
    starRange: 1,
    starIntensity: 1,
    starOffset: 0,
    starShift: Float32Array.of(0, 0, 0),
    bloomRetinaRatio: 0,
    bloomRange: 0.5,
    bloomLevelRange: 0.1,
    bloomIntensity: 1,
    bloomOffset: 0,
    bloomShift: Float32Array.of(0, 0, 0),
    toneRetinaRatio: 0,
    toneRetinaSpeed: 0.1,
    toneMiddleGray: 0.18,
    shoulderStrength: 0,
    linearStrength: 0,
    linearAngle: 0,
    toeStrength: 0,
    toeNumerator: 0,
    toeDenominator: 1,
    whitePoint: 1,
  };
  const filters = {
    bloom: solid({ kind: "bloom", pass: 10, bloom }),
    bloom2: solid({ kind: "bloom2", pass: 10, bloom2 }),
  };
  const frame = (filter: StagePostFilter, width: number, height: number) => {
    const { gl, draws, attached, bound } = recordingGl();
    const post = createStagePost(gl);
    post.begin(width, height);
    const target = bound();
    const scene = attached.get(target);
    draws.length = 0;
    post.end([filter], null);
    return { draws: [...draws], scene, target, attached };
  };
  const sizes = (
    draws: {
      size: string;
    }[],
    from: string,
    to: string,
  ) => draws.map((draw) => (draw.size === from ? to : draw.size));
  it("holds exposure within a tick and reseeds it on seek without reallocating targets", () => {
    const { gl, calls, draws, attached } = recordingGl();
    const post = createStagePost(gl);
    const render = (tick: number, reset = false, width = 960, height = 540) => {
      post.begin(width, height, { tick, reset });
      draws.length = 0;
      post.end([filters.bloom2], null);
      return draws.filter((draw) => draw.size === "1x1");
    };
    const first = render(824, true);
    expect(first).toHaveLength(2);
    expect(first[1].inputs[1]).toBe(attached.get(first[0].target));
    expect(render(824)).toHaveLength(0);
    const advance = render(825);
    expect(advance).toHaveLength(1);
    expect(advance[0].inputs[1]).toBe(attached.get(first[1].target));
    const allocated = calls.filter((call) => call.name === "createTexture").length;
    expect(render(824, true)).toHaveLength(2);
    expect(calls.filter((call) => call.name === "createTexture")).toHaveLength(allocated);
    expect(render(824)).toHaveLength(0);
    expect(render(824, true)).toHaveLength(2);
    expect(render(824, false, 1920, 1080)).toHaveLength(2);
    post.dispose();
    for (const created of calls.filter((call) => call.name === "createTexture"))
      expect(
        calls.filter((call) => call.name === "deleteTexture" && call.args[0] === created.result),
      ).toHaveLength(1);
  });
  it("advances retina adaptation by elapsed Stage ticks and reinitializes a backwards tick", () => {
    const { gl, calls, draws } = recordingGl();
    const post = createStagePost(gl);
    const render = (tick: number, reset = false) => {
      post.begin(960, 540, { tick, reset });
      calls.length = 0;
      draws.length = 0;
      post.end([filters.bloom2], null);
      let retina = false;
      const speeds: number[] = [];
      for (const call of calls) {
        if (call.name === "viewport") retina = call.args[2] === 1 && call.args[3] === 1;
        if (
          retina &&
          call.name === "uniform4fv" &&
          (
            call.args[0] as {
              name: string;
            }
          ).name === "shaderParam0"
        )
          speeds.push((call.args[1] as Float32Array)[0]);
      }
      return speeds[speeds.length - 1];
    };
    expect(render(100, true)).toBe(Math.fround(bloom2.toneRetinaSpeed));
    expect(render(101)).toBe(Math.fround(bloom2.toneRetinaSpeed));
    expect(render(105)).toBe(Math.fround(1 - (1 - bloom2.toneRetinaSpeed) ** 4));
    render(105);
    expect(draws.filter((draw) => draw.size === "1x1")).toHaveLength(0);
    render(100);
    expect(draws.filter((draw) => draw.size === "1x1")).toHaveLength(2);
    post.dispose();
  });
  it("routes authored single-pass streaks through the bloom executor", () => {
    const { gl, calls } = recordingGl();
    const post = createStagePost(gl);
    post.begin(960, 540);
    post.end(
      [
        solid({
          kind: "bloom",
          pass: 20,
          bloom: {
            ...bloom,
            starCount: -1,
            stars: [{ rotation: 20, length: 0.5, twoPass: false }],
          },
        }),
      ],
      null,
    );
    const shaders = calls
      .filter((call) => call.name === "shaderSource")
      .map((call) => call.args[1]);
    expect(shaders).toContainEqual(
      expect.stringContaining("vec2 ofs=parameters[0].xy*argument.xy*vec2(1.0,-1.0);"),
    );
    expect(shaders).not.toContainEqual(expect.stringContaining("outputColor=color/8.0;"));
    expect(calls.some((call) => call.name === "blendEquation" && call.args[0] === gl.MAX)).toBe(
      true,
    );
    post.dispose();
  });
  for (const kind of ["bloom", "bloom2"] as const) {
    it(`${kind} glows at 4K as at 1080p, from a 1080p copy, onto the 4K image`, () => {
      const reference = frame(filters[kind], 1920, 1080);
      expect(reference.draws[0].input).toBe(reference.scene);
      const large = frame(filters[kind], 3840, 2160);
      const [copy, ...glow] = large.draws;
      expect(copy).toMatchObject({ size: "1920x1080", input: large.scene });
      expect(glow[0].input).toBe(large.attached.get(copy.target));
      expect(sizes(glow, "3840x2160", "4K")).toEqual(sizes(reference.draws, "1920x1080", "4K"));
      const onto =
        kind === "bloom"
          ? glow.filter((draw) => draw.target === large.target)
          : glow.filter((draw) => draw.target === "screen");
      expect(onto).toEqual([
        expect.objectContaining({ size: "3840x2160", input: expect.any(String) }),
      ]);
      if (kind === "bloom2") expect(onto[0].input).toBe(large.scene);
    });
    it(`${kind} keeps the 1080p glow on a smaller canvas, read from its own image`, () => {
      const reference = frame(filters[kind], 1920, 1080);
      const small = frame(filters[kind], 1280, 720);
      expect(small.draws[0].input).toBe(small.scene);
      expect(sizes(small.draws, "1280x720", "S")).toEqual(sizes(reference.draws, "1920x1080", "S"));
    });
    it(`${kind} measures the glow of another aspect at a height of 1080`, () => {
      const reference = frame(filters[kind], 1080, 1080);
      const large = frame(filters[kind], 2160, 2160);
      expect(sizes(large.draws.slice(1), "2160x2160", "N")).toEqual(
        sizes(reference.draws, "1080x1080", "N"),
      );
    });
  }
});
describe("filter shader sources", () => {
  const sources = {
    edge: MLAA_EDGE_SHADER,
    weight9: mlaaWeightShader(9),
    weight33: mlaaWeightShader(33),
    blend: MLAA_BLEND_SHADER,
    fxaa3: FXAA3_SHADER,
  };
  for (const [name, source] of Object.entries(sources))
    it(`${name} has no integer literals`, () => {
      const stripped = source.replace(/\d+(\.\d*)?[eE][+-]?\d+/g, "F");
      expect(stripped.match(/(?<![\w.])\d+(?![\w.])/g)).toBeNull();
    });
});
