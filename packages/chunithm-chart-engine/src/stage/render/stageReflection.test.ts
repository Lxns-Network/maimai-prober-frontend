import { describe, expect, it } from "vitest";
import { createStageReflectionTarget, createStageReflectionSizing } from "./stageReflection";
import { mirrorDeviceState, type DeviceStateSet } from "../../gpu/deviceState";
function context() {
  const calls: {
    name: string;
    args: unknown[];
  }[] = [];
  const constants = new Map<string, number>();
  let id = 0;
  let complete = true;
  let floating = true;
  let active = 0;
  let target: unknown = null;
  const bindings = new Map<number, unknown>();
  const attached = new Map<unknown, unknown>();
  const feedback: boolean[] = [];
  const gl = new Proxy({} as WebGL2RenderingContext, {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(name)) {
        if (!constants.has(name)) constants.set(name, 0x1000 + constants.size * 100);
        return constants.get(name);
      }
      return (...args: unknown[]) => {
        calls.push({ name, args });
        if (name.startsWith("create")) return { name, id: ++id };
        if (name === "getExtension") return floating ? {} : null;
        if (name === "checkFramebufferStatus") return complete ? gl.FRAMEBUFFER_COMPLETE : 0;
        if (name === "activeTexture") active = args[0] as number;
        if (name === "bindTexture") bindings.set(active, args[1]);
        if (name === "bindFramebuffer") target = args[1];
        if (name === "framebufferTexture2D") attached.set(target, args[3]);
        if (name === "clear") feedback.push([...bindings.values()].includes(attached.get(target)));
        return undefined;
      };
    },
  });
  return {
    gl,
    calls,
    feedback,
    incomplete: () => (complete = false),
    noFloat: () => (floating = false),
  };
}
describe("reflection target", () => {
  it("retains the native scene size until an authored size property changes", () => {
    const sizing = createStageReflectionSizing();
    expect(sizing.update(1920, 1080, 2, 512, 512)).toEqual([960, 540]);
    expect(sizing.update(1280, 720, 2, 512, 512)).toEqual([960, 540]);
    expect(sizing.update(1280, 720, 2, 256, 512)).toEqual([640, 360]);
    sizing.reset();
    expect(sizing.update(1920, 1080, 2, 256, 512)).toEqual([960, 540]);
  });
  it("uses the published reflection texture's captured address and default filter modes", () => {
    const { gl, calls } = context();
    const target = createStageReflectionTarget(gl);
    target.begin(640, 360);
    const parameters = calls.filter((call) => call.name === "texParameteri");
    expect(parameters.map((call) => call.args)).toEqual([
      [gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT],
      [gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT],
    ]);
    target.dispose();
  });
  it("unbinds the sampled texture, reuses its target, reallocates on resize and releases it", () => {
    const { gl, calls, feedback } = context();
    const target = createStageReflectionTarget(gl);
    const first = target.begin(640, 360);
    gl.activeTexture(gl.TEXTURE0 + 7);
    gl.bindTexture(gl.TEXTURE_2D, first);
    expect(target.begin(640, 360)).toBe(first);
    const second = target.begin(320, 180);
    expect(second).not.toBe(first);
    expect(calls.filter((call) => call.name === "createTexture")).toHaveLength(2);
    expect(feedback).toEqual([false, false, false]);
    const secondBegin = calls.findIndex(
      (call, i) => i > 0 && call.name === "deleteTexture" && call.args[0] === first,
    );
    const prior = calls.slice(0, secondBegin);
    expect(prior[prior.length - 1]).toEqual({ name: "bindTexture", args: [gl.TEXTURE_2D, null] });
    expect(prior[prior.length - 2]).toEqual({ name: "activeTexture", args: [gl.TEXTURE0 + 7] });
    target.dispose();
    expect(
      calls.filter((call) => call.name === "deleteTexture" && call.args[0] === second),
    ).toHaveLength(1);
    expect(calls.filter((call) => call.name === "deleteFramebuffer" && call.args[0])).toHaveLength(
      2,
    );
    expect(calls.filter((call) => call.name === "deleteRenderbuffer" && call.args[0])).toHaveLength(
      2,
    );
  });
  it("releases partially created resources if the framebuffer is incomplete", () => {
    const { gl, calls, incomplete } = context();
    incomplete();
    const target = createStageReflectionTarget(gl);
    expect(() => target.begin(640, 360)).toThrow(/incomplete/);
    for (const name of ["deleteTexture", "deleteFramebuffer", "deleteRenderbuffer"])
      expect(calls.filter((call) => call.name === name && call.args[0])).toHaveLength(1);
  });
  it("changes colour format on HDR transitions without reusing a normalized target", () => {
    const { gl, calls, noFloat } = context();
    const target = createStageReflectionTarget(gl);
    const normalized = target.begin(64, 32);
    const floating = target.begin(64, 32, true);
    expect(floating).not.toBe(normalized);
    expect(target.begin(64, 32, true)).toBe(floating);
    expect(target.begin(64, 32, false)).not.toBe(floating);
    expect(
      calls.filter((call) => call.name === "texStorage2D").map((call) => call.args[2]),
    ).toEqual([gl.RGBA8, gl.RGBA16F, gl.RGBA8]);
    noFloat();
    expect(() => target.begin(64, 32, true)).toThrow("half-float render targets are unavailable");
    target.dispose();
  });
});
describe("reflection cull command", () => {
  it("preserves NONE and forces both face-culling modes to D3D CCW without changing the input", () => {
    for (const [input, expected] of [
      [1, 1],
      [2, 3],
      [3, 3],
    ]) {
      const values = new Float64Array(256);
      values[22] = input;
      const state: DeviceStateSet = { values };
      expect(mirrorDeviceState(state).values[22]).toBe(expected);
      expect(state.values[22]).toBe(input);
      expect(mirrorDeviceState(state)).toBe(mirrorDeviceState(state));
    }
  });
});
