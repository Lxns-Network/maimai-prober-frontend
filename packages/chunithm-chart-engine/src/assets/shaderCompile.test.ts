import { describe, expect, it, vi } from "vitest";
import { compilePrograms } from "./shaderCompile";

function fakeGl(parallel: boolean, readyAfter: number, linkOk = true) {
  let polls = 0;
  const statusReads: string[] = [];
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    LINK_STATUS: 3,
    COMPILE_STATUS: 4,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    isContextLost: () => false,
    getExtension: (n: string) =>
      parallel && n === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR: 99 } : null,
    getProgramParameter: (_p: unknown, pname: number) => {
      if (pname === 99) return ++polls > readyAfter;
      statusReads.push(`link@${polls}`);
      return linkOk;
    },
    getShaderParameter: () => true,
    getProgramInfoLog: () => "bad link",
    getShaderInfoLog: () => "",
  };
  return { gl: gl as unknown as WebGL2RenderingContext, statusReads };
}

const now = (cb: () => void) => queueMicrotask(cb);

describe("compilePrograms", () => {
  it("waits for completion before reading LINK_STATUS when parallel compile is available", async () => {
    const { gl, statusReads } = fakeGl(true, 3);
    const programs = await compilePrograms(
      gl,
      [
        { name: "a", vertex: "v", fragment: "f" },
        { name: "b", vertex: "v", fragment: "f" },
      ],
      now,
    );
    expect([...programs.keys()]).toEqual(["a", "b"]);
    expect(statusReads.every((s) => Number(s.split("@")[1]) > 3)).toBe(true);
  });
  it("still works without the extension", async () => {
    const { gl } = fakeGl(false, 0);
    expect((await compilePrograms(gl, [{ name: "a", vertex: "v", fragment: "f" }], now)).size).toBe(
      1,
    );
  });
  it("rejects with the info log on link failure", async () => {
    const { gl } = fakeGl(false, 0, false);
    await expect(
      compilePrograms(gl, [{ name: "a", vertex: "v", fragment: "f" }], now),
    ).rejects.toThrow(/a.*bad link/);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });
});
