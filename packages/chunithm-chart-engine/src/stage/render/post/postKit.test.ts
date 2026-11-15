import { describe, expect, it } from "vitest";
import { createPostProgram, createPostSurface } from "./postKit";
import { createStageDofPass } from "./stageDof";
import { createStageMlaaPass } from "./stageMlaa";

function failingGl(failAt: number, failure?: "vertex" | "fragment" | "link") {
  let next = 0;
  let checks = 0;
  const created: object[] = [];
  const deleted: object[] = [];
  const storage: number[] = [];
  const constants = new Map<string, number>();
  const constant = (name: string) => {
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const gl = new Proxy({} as WebGL2RenderingContext, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(prop)) return constant(prop);
      return (...args: unknown[]) => {
        if (prop.startsWith("create")) {
          const handle = { kind: prop.slice(6), id: ++next };
          created.push(handle);
          return handle;
        }
        if (prop.startsWith("delete") && args[0]) deleted.push(args[0] as object);
        if (prop === "texStorage2D") storage.push(args[2] as number);
        if (prop === "checkFramebufferStatus")
          return ++checks === failAt ? 0 : constant("FRAMEBUFFER_COMPLETE");
        if (prop === "getShaderParameter") {
          const shaders = created.filter((item) => (item as { kind: string }).kind === "Shader");
          return (
            !(failure === "vertex" && args[0] === shaders[0]) &&
            !(failure === "fragment" && args[0] === shaders[1])
          );
        }
        if (prop === "getProgramParameter") return failure !== "link";
        if (prop === "getShaderInfoLog" || prop === "getProgramInfoLog") return "";
        if (prop === "getUniformLocation") return {};
        return undefined;
      };
    },
  });
  return { gl, created, deleted, storage };
}

describe("stage post targets", () => {
  it.each(["vertex", "fragment", "link"] as const)(
    "releases the post program and shaders after %s failure",
    (failure) => {
      const { gl, created, deleted } = failingGl(0, failure);
      expect(() => createPostProgram(gl, "void main(){}")).toThrow(
        failure === "link" ? /program link failed/ : /shader compilation failed/,
      );
      expect(created.filter((item) => (item as { kind: string }).kind === "Program")).toHaveLength(
        1,
      );
      expect(new Set(deleted)).toEqual(new Set(created));
      for (const handle of created)
        expect(deleted.filter((item) => item === handle)).toHaveLength(1);
    },
  );

  it("releases both handles when target creation fails", () => {
    const { gl, created, deleted } = failingGl(1);
    expect(() => createPostSurface(gl, 32, 16, gl.RGBA16F)).toThrow(/incomplete/);
    expect(deleted).toEqual([created[1], created[0]]);
  });

  it("releases the first anti-aliasing target when the second fails", () => {
    const { gl, created, deleted } = failingGl(2);
    const pass = createStageMlaaPass(gl);
    const source = { texture: {} as WebGLTexture };
    const mlaa = { pass: 20, distance: 9, threshold: 0.1 };
    expect(() => pass.apply(mlaa, source, null, 64, 32)).toThrow(/incomplete/);
    const targets = created.filter((item) =>
      ["Texture", "Framebuffer"].includes((item as { kind: string }).kind),
    );
    expect(targets).toHaveLength(4);
    for (const handle of targets) expect(deleted.filter((item) => item === handle)).toHaveLength(1);
    pass.dispose();
    for (const handle of created) expect(deleted.filter((item) => item === handle)).toHaveLength(1);
  });

  it("releases all partial depth-of-field targets before retrying", () => {
    const { gl, created, deleted, storage } = failingGl(3);
    const pass = createStageDofPass(gl);
    const dof = {
      pass: 20,
      autofocus: false,
      focusNoBlur: false,
      divisor: 2,
      values: Float32Array.of(100, 50, 0, 50, 0, 1000),
    };
    const camera = {
      position: [0, 0, 0] as [number, number, number],
      target: [0, 0, -1] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      fovDegrees: 45,
      aspect: 2,
      parallel: false,
      view: new Float32Array(16),
      projection: new Float32Array(16),
      viewProjection: new Float32Array(16),
    };
    const texture = {} as WebGLTexture;
    const scene = { texture, width: 64, height: 32, internalFormat: gl.RGBA8 };
    const snapshot = { texture, framebuffer: {} as WebGLFramebuffer };
    expect(() => pass.apply(dof, camera, scene, snapshot, texture, null)).toThrow(/incomplete/);
    const targets = created.filter((item) =>
      ["Texture", "Framebuffer"].includes((item as { kind: string }).kind),
    );
    expect(targets).toHaveLength(6);
    expect(new Set(deleted)).toEqual(new Set(targets));

    pass.apply(dof, camera, scene, snapshot, texture, null);
    const count = created.length;
    pass.apply(dof, camera, scene, snapshot, texture, null);
    expect(created).toHaveLength(count);
    expect(storage).toEqual(Array(6).fill(gl.RGBA8));
    pass.apply(dof, camera, { ...scene, internalFormat: gl.RGBA16F }, snapshot, texture, null);
    expect(storage).toEqual([...Array(6).fill(gl.RGBA8), ...Array(3).fill(gl.RGBA16F)]);
    pass.dispose();
    for (const handle of created) expect(deleted.filter((item) => item === handle)).toHaveLength(1);
  });
});
