import { describe, expect, it } from "vitest";
import {
  INSTANCED_ATTRIBUTES,
  INSTANCED_FLOATS,
  declaresUvTransform,
  instancedShader,
  splitShader,
} from "./notePrograms";
describe("splitShader", () => {
  it("splits a packed entry at its NUL separator", () => {
    const packed = new TextEncoder().encode("#version 300 es\nvertex\0#version 300 es\nfragment");
    const { vertex, fragment } = splitShader(packed);
    expect(vertex).toBe("#version 300 es\nvertex");
    expect(fragment).toBe("#version 300 es\nfragment");
  });
  it("rejects an entry without a separator", () => {
    expect(() => splitShader(new TextEncoder().encode("only vertex"))).toThrow(
      /vertex and a fragment/,
    );
  });
});
describe("declaresUvTransform", () => {
  it("finds a declaration that carries a trailing comment", () => {
    expect(
      declaresUvTransform(
        "#version 300 es\nuniform vec4 uUvOffsetScale; // offset.xy, scale.zw\nvoid main(){}",
      ),
    ).toBe(true);
  });
  it("ignores the name where only a comment mentions it", () => {
    expect(
      declaresUvTransform("#version 300 es\n// uniform vec4 uUvOffsetScale;\nvoid main(){}"),
    ).toBe(false);
    expect(
      declaresUvTransform("#version 300 es\n/* uniform vec4 uUvOffsetScale; */\nvoid main(){}"),
    ).toBe(false);
  });
  it("ignores a longer uniform name that only begins with it", () => {
    expect(
      declaresUvTransform("#version 300 es\nuniform vec4 uUvOffsetScale1;\nvoid main(){}"),
    ).toBe(false);
  });
});
describe("instancedShader over the packed programs", () => {
  it("rejects a shader whose fragment stage reads the world transform", () => {
    const vertex = "#version 300 es\nuniform mat4 uWorld;\nvoid main(){}";
    const fragment = "#version 300 es\nuniform mat4 uWorld;\nvoid main(){}";
    expect(instancedShader(vertex, fragment)).toBeUndefined();
  });
  it("rejects a shader that depends on the instance id", () => {
    const withInstanceId =
      "#version 300 es\nuniform mat4 uWorld;\nvoid main(){ gl_Position = vec4(gl_InstanceID); }";
    expect(instancedShader(withInstanceId, "#version 300 es\nvoid main(){}")).toBeUndefined();
    const fragmentId = "#version 300 es\nvoid main(){ if (gl_InstanceID > 0) discard; }";
    expect(
      instancedShader("#version 300 es\nuniform mat4 uWorld;\nvoid main(){}", fragmentId),
    ).toBeUndefined();
  });
  it("rejects a shader without exactly one uWorld mat4 declaration", () => {
    const none = "#version 300 es\nvoid main(){}";
    expect(instancedShader(none, "#version 300 es\nvoid main(){}")).toBeUndefined();
    const twice = "#version 300 es\nuniform mat4 uWorld;\nuniform mat4 uWorld;\nvoid main(){}";
    expect(instancedShader(twice, "#version 300 es\nvoid main(){}")).toBeUndefined();
  });
  it("leaves a fragment-stage vec4 uniform alone", () => {
    // Every packed program declares its vec4 values in the fragment stage, so they cannot become
    // vertex attributes; the rewrite must not touch them.
    const vertex = "#version 300 es\nuniform mat4 uWorld;\nvoid main(){}";
    const fragment = "#version 300 es\nuniform vec4 uDiffuse;\nvoid main(){}\n";
    const instanced = instancedShader(vertex, fragment)!;
    expect(instanced.fragment).toBe(fragment);
    expect(instanced.vertex).not.toContain("aInstanceDiffuse");
  });
  it("declares the instance attributes in the order the buffer lays them out", () => {
    // The attribute list is the contract between the buffer and the shader; a reorder would make
    // every instance read its neighbour's transform.
    // Only the world matrix travels as an attribute; the tint and uv are fragment-stage uniforms.
    expect(INSTANCED_ATTRIBUTES).toEqual([
      "aInstanceWorld0",
      "aInstanceWorld1",
      "aInstanceWorld2",
      "aInstanceWorld3",
    ]);
    expect(INSTANCED_FLOATS).toBe(12);
  });
});
