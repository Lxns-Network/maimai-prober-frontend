import { describe, expect, it } from "vitest";
import { type StageNode, type StageScene } from "../runtime";
import {
  bindStageReflections,
  reflectionNode,
  reflectionSettingsError,
  stageReflection,
  stageReflectionScenes,
} from "./reflection";
import { ColorElement } from "../elements";
describe("reflection node settings", () => {
  it("accepts the source size and refraction forms and rejects unsupported settings", () => {
    const words = [0x4131, 1, 0xffffffff, 1, 512, 512, 0, 0, 0, 1];
    const graph = {
      u32: (at: number) => words[at / 4],
      f32: (at: number) => new Float32Array(Uint32Array.of(words[at / 4]).buffer)[0],
    };
    expect(reflectionSettingsError(graph, null)).toMatch(/missing/);
    expect(reflectionSettingsError(graph, 0)).toBeNull();
    words[3] = 2;
    words[6] = 0x3e4ccccd;
    expect(reflectionSettingsError(graph, 0)).toBeNull();
    words[3] = 1;
    words[6] = 0;
    words[1] = 0;
    words[2] = 16;
    words[3] = 0;
    expect(reflectionSettingsError(graph, 0)).toBeNull();
    words[7] = 1;
    words[9] = 0;
    expect(reflectionSettingsError(graph, 0)).toBeNull();
    words[8] = 1;
    expect(reflectionSettingsError(graph, 0)).toBeNull();
    words[8] = 0;
    words[6] = 0x7f800000;
    expect(reflectionSettingsError(graph, 0)).toMatch(/settings/);
  });
  it("keeps the camera source separate from inherited and explicit caster draw indices", () => {
    const make = (drawIndex: number, explicit: number, enabled = 1, hdr = 1, clip = 0) => {
      const data = new DataView(
        Uint32Array.of(0, enabled, explicit, 0, 37, 9, 0, hdr, 0, clip).buffer,
      );
      const scene = {
        options: { drawIndex },
        classState: new Map(),
        missing: new Set(),
        graph: {
          u32: (at: number) => data.getUint32(at, true),
          i32: (at: number) => data.getInt32(at, true),
          f32: (at: number) => data.getFloat32(at, true),
          target: () => 0,
          text: () => "Mirror",
        },
      } as unknown as StageScene;
      const node = {
        scene,
        parent: null,
        record: { settings: 0 },
        world: Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
        elements: [
          Object.assign(Object.create(ColorElement.prototype), { type: 101, color: 0xffffffff }),
        ],
      } as unknown as StageNode;
      return { scene, node };
    };
    const field = make(0, 16),
      base = make(16, -1);
    bindStageReflections([field.scene, base.scene]);
    reflectionNode.construct!(base.node);
    expect(stageReflectionScenes(stageReflection(base.scene)!, [field.scene, base.scene])).toEqual({
      source: base.scene,
      casters: base.scene,
    });
    reflectionNode.construct!(field.node);
    const light = stageReflection(base.scene)!;
    expect(light).toMatchObject({
      sourceDrawIndex: 0,
      drawIndex: 16,
      sizeMode: 0,
      width: 37,
      height: 9,
      requestHdr: true,
      clipPlane: false,
    });
    const routed = stageReflectionScenes(light, [field.scene, base.scene]);
    expect(routed.source).toBe(field.scene);
    expect(routed.casters).toBe(base.scene);
    reflectionNode.dispose!(field.node);
    expect(stageReflection(base.scene)).toBe(light);
    expect(() => stageReflectionScenes(light, [base.scene])).toThrow("unavailable draw index 0");
    const disabled = make(0, -1, 0);
    reflectionNode.construct!(disabled.node);
    expect(stageReflection(disabled.scene)).toBeNull();
    expect([...disabled.scene.missing]).toEqual([]);
  });
});
