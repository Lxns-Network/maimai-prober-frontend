import { describe, expect, it } from "vitest";
import { createStageShadowTargets } from "./stageShadow";
function context(
  options: {
    incomplete?: boolean;
    failFramebuffer?: boolean;
  } = {},
) {
  const calls: {
    name: string;
    args: unknown[];
  }[] = [];
  const constants = new Map<string, number>();
  let id = 0;
  const gl = new Proxy({} as WebGL2RenderingContext, {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(name)) {
        if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
        return constants.get(name);
      }
      return (...args: unknown[]) => {
        calls.push({ name, args });
        if (name === "createFramebuffer" && options.failFramebuffer) return null;
        if (name.startsWith("create")) return { name, id: ++id };
        if (name === "getExtension") return {};
        if (name === "getShaderParameter" || name === "getProgramParameter") return true;
        if (name === "checkFramebufferStatus")
          return options.incomplete ? 0 : gl.FRAMEBUFFER_COMPLETE;
        return undefined;
      };
    },
  });
  return { gl, calls };
}
describe("directional shadow target", () => {
  it("clears a white rim around the native-sized depth viewport and reuses each cascade", () => {
    const { gl, calls } = context();
    const targets = createStageShadowTargets(gl);
    const first = targets.begin(0, 512, 256);
    const clear = calls.findIndex((call) => call.name === "clear");
    expect(calls.find((call) => call.name === "texStorage2D")?.args).toEqual([
      gl.TEXTURE_2D,
      1,
      gl.DEPTH_COMPONENT16,
      514,
      258,
    ]);
    expect(calls.slice(clear - 3, clear + 2)).toEqual([
      { name: "depthMask", args: [true] },
      { name: "clearDepth", args: [1] },
      { name: "disable", args: [gl.SCISSOR_TEST] },
      { name: "clear", args: [gl.DEPTH_BUFFER_BIT] },
      { name: "viewport", args: [1, 1, 512, 256] },
    ]);
    expect(targets.begin(0, 512, 256)).toBe(first);
    const second = targets.begin(1, 512, 256);
    expect(second).not.toBe(first);
    expect(calls.filter((call) => call.name === "createTexture")).toHaveLength(2);
    targets.begin(0, 256, 128);
    expect(calls.filter((call) => call.name === "deleteTexture" && call.args[0])).toHaveLength(2);
    targets.dispose();
    expect(calls.filter((call) => call.name === "deleteTexture" && call.args[0])).toHaveLength(3);
  });
  it("cleans up and preserves the target error if a sparse cascade allocation fails", () => {
    for (const options of [{ incomplete: true }, { failFramebuffer: true }]) {
      const { gl, calls } = context(options);
      const targets = createStageShadowTargets(gl);
      expect(() => targets.begin(1, 512, 512)).toThrow(/Stage shadow: target/);
      expect(calls.filter((call) => call.name === "deleteTexture" && call.args[0])).toHaveLength(1);
      targets.dispose();
    }
  });
  it("retains the prefix and releases retired cascades before they can be reused", () => {
    const { gl, calls } = context();
    const targets = createStageShadowTargets(gl);
    const textures = [0, 1, 2].map((index) => targets.begin(index, 64, 64));
    targets.resize(1);
    expect(
      calls
        .filter((call) => call.name === "deleteTexture" && call.args[0])
        .map((call) => call.args[0]),
    ).toEqual(textures.slice(1));
    expect(targets.begin(0, 64, 64)).toBe(textures[0]);
    expect(targets.begin(1, 64, 64)).not.toBe(textures[1]);
    targets.resize(0);
    expect(calls.filter((call) => call.name === "deleteTexture" && call.args[0])).toHaveLength(4);
    targets.dispose();
  });
});
