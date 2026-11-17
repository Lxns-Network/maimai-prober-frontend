import { expect, it } from "vitest";
import type { StageModel, StagePack, StageShape } from "../pack";
import type { StageShadowLight } from "../nodes/shadow";
import type { StageReflection } from "../nodes/reflection";
import type { StageNode, StageScene, StageLightGroups } from "../runtime";
import { createStageRenderer } from "./stageRenderer";

for (const targets of [1, 31, 32, 34])
  it(`submits mesh-local skin rows for ${targets} targets`, () => {
    const matrix = (x = 0, y = 0, z = 0) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
    const bits = (values: number[]) => [...new Uint32Array(Float32Array.from(values).buffer)];
    const targetName = new TextEncoder().encode("bone\0");
    const targetBytes = new Uint8Array(4 + targets * (2 + targetName.length));
    const targetView = new DataView(targetBytes.buffer);
    targetView.setUint32(0, targets, true);
    for (let i = 0; i < targets; i++) {
      const at = 4 + i * (2 + targetName.length);
      targetView.setUint16(at, targetName.length, true);
      targetBytes.set(targetName, at + 2);
    }
    const targetNames = Array.from(targetBytes, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const meshWorld = matrix(2, -3, 4);
    const boneBind = matrix(0, 0, -5);
    const node = (ref: number, name: string, translation: number[], parent: number) => ({
      ref,
      fields: {
        _name: name,
        _fullName: name,
        _parent: { ref: parent },
        _child: { ref: ref === 1 ? 2 : 0 },
        _sibling: { ref: 0 },
        _translation: { words: bits(translation) },
        _quaternion: { words: bits([0, 0, 0, 1]) },
        _scale: { words: bits([1, 1, 1]) },
        _mtxWorld: { words: bits(ref === 1 ? meshWorld : matrix(2, -3, 9)) },
        _mtxBind: { words: bits(ref === 1 ? matrix() : boneBind) },
      },
    });
    const commands = [
      [27, 0],
      [206, 0],
      [171, 1],
      [19, 1],
      [20, 1],
      [209, 1],
      [207, 1],
      [208, 1],
      [193, 0],
      [15, 0],
      [24, 0],
      [25, 8],
      [7, 1],
      [14, 1],
      [23, 4],
      [195, 0],
      [175, 0],
      [52, 0],
      [22, 1],
      [174, 0],
      [168, 15],
      [8, 3],
    ];
    const shape = {
      ref: 3,
      name: "skinned",
      fields: {
        _sortDistanceOffset: { u32: 0 },
        _meshBindMatrix: { words: bits(matrix()) },
        _blendTargetName: { raw: targetNames },
        _boundingBoxCenter: { words: bits([0, 0, 0]) },
        _boundingBoxSize: { words: bits([2, 2, 2]) },
        _boundingSphere: { words: bits([0, 0, 0, 1]) },
      },
      nodeRefs: [1],
      vertexCount: 1,
      stride: 16,
      layout: [
        { semantic: 0, type: 2, index: 0, offset: 0, size: 12 },
        { semantic: 1, type: 8, index: 0, offset: 12, size: 4 },
      ],
      vertices: new Uint8Array(16),
      indices: targets === 1 ? new Uint16Array([0, 0, 0]) : new Uint32Array([0, 0, 0]),
      state: {
        _name: "material",
        _lighting: "constant",
        _shaderName: "",
        _fillType: { u32: 0 },
        _alphaRef: { u32: 0 },
      },
      renderState: { commands },
      parameters: [
        { name: "tsShadowCaster", value: { _variantType: { u32: 1 }, _valueS32: { u32: 1 } } },
      ],
      textures: [],
    } as unknown as StageShape;
    const model: StageModel = {
      name: "translated-mesh",
      nodes: [node(1, "mesh", [2, -3, 4], 0), node(2, "bone", [0, 0, 5], 1)],
      shapes: [shape],
    };
    const pack = {
      model: () => model,
      texture: () => null,
      graphs: { base: { nodes: [] }, field: { nodes: [] } },
    } as unknown as StagePack;
    const identity = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const scene = {
      graph: {},
      root: null,
      options: {},
      classState: new Map(),
    } as unknown as StageScene;
    const root = {
      scene,
      parent: null,
      children: [],
      record: { type: 6001001, layer: 0, priority: 0, settings: null },
      extension: {
        resources: [0],
        diffuse: null,
        specular: null,
        blend: null,
        blendError: null,
        textureSwaps: [],
        materialUv: null,
      },
      flags: 0x80000,
      world: identity,
      elements: [],
    } as unknown as StageNode;
    (scene as { root: StageNode }).root = root;
    const uniforms = new Map<string, number[]>();
    let draws = 0;
    let geometryUploads = 0;
    const indexTypes: unknown[] = [];
    let id = 0;
    const constants = new Map<string, number>();
    const gl = new Proxy({} as WebGL2RenderingContext, {
      get(_, property) {
        if (typeof property !== "string") return undefined;
        if (/^[A-Z0-9_]+$/.test(property)) {
          if (!constants.has(property)) constants.set(property, 0x1000 + constants.size);
          return constants.get(property);
        }
        return (...args: unknown[]) => {
          if (property.startsWith("create")) return { id: ++id };
          if (property === "getShaderParameter" || property === "getProgramParameter") return true;
          if (property === "getUniformLocation") return { name: args[1] };
          if (property === "getParameter") return new Int32Array([0, 0, 1920, 1080]);
          const name = (args[0] as { name?: string })?.name;
          if (name && property === "uniformMatrix4fv")
            uniforms.set(name, Array.from(args[2] as Float32Array));
          if (name && property === "uniform4fv")
            uniforms.set(name, Array.from(args[1] as Float32Array));
          if (name && property === "uniform3fv")
            uniforms.set(name, Array.from(args[1] as Float32Array));
          if (name && property === "uniform1i") uniforms.set(name, [args[1] as number]);
          if (
            property === "bufferData" &&
            (args[1] === shape.vertices || args[1] === shape.indices)
          )
            geometryUploads++;
          if (property === "drawElements") {
            draws++;
            indexTypes.push(args[2]);
          }
          return undefined;
        };
      },
    });
    const renderer = createStageRenderer(gl, pack, new Map());
    const wide = Float32Array.of(0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 1);
    const result = renderer.draw({
      scene,
      role: "base",
      camera: {
        view: identity,
        projection: identity,
        viewProjection: wide,
        position: [0, 0, 0],
      },
      lighting: { lights: [] },
    });
    expect([...result.skipped]).toEqual([]);
    expect(draws).toBe(1);
    expect(indexTypes).toEqual([targets === 1 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT]);
    const large = targets >= 32;
    expect(uniforms.get("world")).toEqual([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      large ? 4 : 2,
      large ? -6 : -3,
      large ? 13 : 4,
      1,
    ]);
    expect(uniforms.get("skinRows")!.slice(0, 12)).toEqual(large ? matrix(-2, 3, -9) : matrix());
    const shadowLight = { settings: { alphaReference: 0, bias: 0, slope: 0 } } as StageShadowLight;
    const camera = {
      view: identity,
      projection: identity,
      viewProjection: identity,
      position: [0, 0, 0],
    };
    const collected = renderer.prepareShadow(
      { scene, role: "base", camera, lighting: { lights: [] }, shadowPass: shadowLight },
      { ...camera, cullViewProjection: wide, sortProjection: identity, textureMatrix: identity },
    );
    expect([...collected.skipped.values()]).toEqual([]);
    const expectedHalf = large ? [1.5, 2, 2.5] : [1, 1, 3];
    const expectedRadius = Math.fround(Math.sqrt(expectedHalf.reduce((sum, n) => sum + n * n, 0)));
    expect(collected.casterSpheres).toEqual([
      large ? [3.5, -5, 11.5, expectedRadius] : [2, -3, 6, expectedRadius],
    ]);
    const upperSlice = Float32Array.of(0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.2, -1.8, 0, 0, 0, 1);
    const partial = renderer.prepareShadow(
      { scene, role: "base", camera, lighting: { lights: [] }, shadowPass: shadowLight },
      {
        ...camera,
        cullViewProjection: upperSlice,
        sortProjection: identity,
        textureMatrix: identity,
      },
    );
    expect(partial.casterSpheres).toEqual(collected.casterSpheres);
    const outside = Float32Array.of(0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.5, -10, 0, 0, 0, 1);
    const beforeMirror = draws;
    for (const mirror of [
      undefined,
      { plane: Float32Array.of(0, 1, 0, 0), clipPlane: false } as StageReflection,
    ]) {
      for (const [viewProjection, expected] of [
        [wide, 1],
        [upperSlice, 1],
        [outside, 0],
        [wide, 1],
      ] as const) {
        const result = renderer.draw({
          scene,
          role: "base",
          camera: { ...camera, viewProjection },
          lighting: { lights: [] },
          mirror,
        });
        expect([...result.skipped.values()]).toEqual([]);
        expect(result.draws).toBe(expected);
      }
    }
    expect(draws - beforeMirror).toBe(6);
    const culled = renderer.prepareShadow(
      { scene, role: "base", camera, lighting: { lights: [] }, shadowPass: shadowLight },
      { ...camera, cullViewProjection: outside, sortProjection: identity, textureMatrix: identity },
    );
    expect(culled.casterSpheres).toEqual([]);
    expect(culled.draw(camera).draws).toBe(0);
    root.world[12] = 1000;
    const shadow = collected.draw(camera);
    expect(shadow.draws).toBe(1);
    expect(draws).toBe(beforeMirror + 7);
    expect(uniforms.get("world")![12]).toBe(large ? 4 : 2);
    expect([...shadow.skipped.values()]).toEqual([]);
    if (targets === 1) {
      root.world[12] = 0;
      const lights = [0, 1].map((group) => ({
        light: {
          key: `shadow-${group}`,
          mask: 1 << group,
          direction: [group, -1, 0],
          diffuse: [1, 1, 1],
          specular: [0, 0, 0],
          color: [0.2, 0.4, 0.6],
          settings: { edgeHide: false, softness: group, colorShadow: 0 },
        } as unknown as StageShadowLight,
        cameras: [
          {
            ...camera,
            textureMatrix: identity,
            cullViewProjection: identity,
            sortProjection: identity,
          },
        ],
        textures: [{} as WebGLTexture],
      }));
      for (const group of [0, 1, 2, 0]) {
        (scene.options as { lightGroups: StageLightGroups }).lightGroups = [
          group,
          group,
          group,
          group,
          group,
          group,
          group,
          group,
          group,
          group,
        ];
        renderer.draw({
          scene,
          role: "base",
          camera: { ...camera, viewProjection: wide },
          lighting: { lights: [] },
          shadows: lights,
        });
        expect(uniforms.get("shadowLightEnabled")).toEqual([group === 2 ? 0 : 1]);
        expect(uniforms.get("shadowCascadeCount")).toEqual([group === 2 ? 0 : 1]);
        if (group !== 2) {
          expect(uniforms.get("shadowDirection")).toEqual([group, -1, 0]);
          expect(uniforms.get("shadowSoftness")).toEqual([group]);
        }
      }
    }
    (model.shapes as StageShape[]).push({ ...shape, ref: 4 });
    renderer.draw({
      scene,
      role: "base",
      camera: { ...camera, viewProjection: wide },
      lighting: { lights: [] },
    });
    expect(geometryUploads).toBe(2);
    renderer.dispose();
  });
