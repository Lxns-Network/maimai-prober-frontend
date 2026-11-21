import { effectPlayerLayer } from "./players";
import { expect, it } from "vitest";
import {
  plainMaterial,
  type ParticleDrawState,
  type PrimitiveDraw,
  type TextureBinding,
} from "./eval/draw";
import type { ParticlePacket, PrimitivePacket } from "./instance";
import { createEffectPublisher, createParticleRings } from "./publish";
function particleSource(): ParticlePacket<ParticleDrawState> {
  return {
    instanceId: 0,
    resourceId: 0,
    draw: {
      binding: {
        elementOffset: 0,
        referenceOrdinal: 0,
        resourceIndex: 0,
        referenceValue: 0,
        parameterWords: [],
        sampler: {
          wrapU: 0,
          wrapV: 0,
          minFilter: 0,
          magFilter: 0,
          mipFilter: 0,
          anisoNumber: 1,
          lodBiasBits: 0,
        },
      },
      sourceFlags: 0x2de004,
      featureWord144: 0,
    },
    worldMatrix: new Float32Array(16),
    parameters: new Float32Array(236),
    births: null,
    ringIndex: 0,
    start: 0,
    count: 1,
    layer: 0,
    priority: 0,
    orderKey: 0x8580,
  };
}

it("refreshes a reused particle slot's material fog gate", () => {
  const particleRings = createParticleRings(1);
  const publisher = createEffectPublisher({ maximumParticles: 1, particleRings });
  const next = createEffectPublisher({ maximumParticles: 1, particleRings });
  const source = particleSource();
  let previous;
  for (const gate of [0, 0x4000, 0]) {
    publisher.reset();
    source.draw = { ...source.draw, featureWord144: gate };
    publisher.particle(source);
    const packet = publisher.packets[0];
    if (packet.kind !== "particle") throw new Error("expected particle");
    if (previous) expect(packet).toBe(previous);
    expect(packet.material.fog).toBe(gate === 0);
    next.reset();
    next.particle(source);
    const other = next.packets[0];
    if (other.kind !== "particle") throw new Error("expected particle");
    expect(packet.mesh.attributes.aTangent.values).toBe(other.mesh.attributes.aTangent.values);
    previous = packet;
  }
});

it("merges additions in player and creation order, retaining an instance's draw order", () => {
  const publisher = createEffectPublisher({ maximumParticles: 1 });
  const source = particleSource();
  [
    [24, 3],
    [23, 5],
    [23, 2],
    [24, 1],
    [23, 2],
  ].forEach(([resourceId, instanceId], i) => {
    publisher.particle({ ...source, resourceId, instanceId, interpolationKey: String(i) });
  });
  publisher.sort();
  expect(publisher.packets.map((packet) => packet.interpolationKey)).toEqual([
    "2",
    "4",
    "1",
    "3",
    "0",
  ]);
});
it("retains live texture conversions across frames and selects new references independently", () => {
  const publisher = createEffectPublisher({ maximumParticles: 1 });
  const binding: TextureBinding = {
    elementOffset: 100,
    referenceOrdinal: 0,
    resourceIndex: 7,
    referenceValue: 0,
    parameterWords: [],
    sampler: {
      wrapU: 0,
      wrapV: 2,
      minFilter: 1,
      magFilter: 1,
      mipFilter: 0,
      anisoNumber: 1,
      lodBiasBits: 0,
    },
  };
  const packet: PrimitivePacket = {
    instanceId: 0,
    resourceId: 0,
    draw: {
      layout: 4,
      strip: false,
      vertexCount: 6,
      sortDistanceOffset: 0,
      material: plainMaterial(0x2de003, 0, 0, 4, 1),
    } as PrimitiveDraw,
    worldMatrix: new Float32Array(16),
    vertices: new Float32Array(36),
    textureOffsets: new Float32Array(6),
    secondaryUv: new Float32Array(12),
    bindings: [binding],
    bindingCount: 1,
    layer: 0,
    priority: 0,
    orderKey: 0x8580,
  };
  publisher.sink.primitive(packet);
  const converted = publisher.packets[0].bindings[0];
  expect(converted).toEqual({
    resourceIndex: 7,
    sampler: {
      addressU: 1,
      addressV: 3,
      minFilter: 2,
      magFilter: 2,
      mipFilter: 1,
      maxMipLevel: 0,
      maxAnisotropy: 1,
    },
  });
  publisher.reset();
  publisher.sink.primitive(packet);
  expect(publisher.packets[0].bindings[0]).toBe(converted);
  packet.bindings = [
    { ...binding, resourceIndex: 9, sampler: { ...binding.sampler, magFilter: 0 } },
  ];
  publisher.sink.primitive(packet);
  expect(publisher.packets[0].bindings[0]).toBe(converted);
  expect(publisher.packets[1].bindings[0].resourceIndex).toBe(9);
  expect(publisher.packets[1].bindings[0].sampler.magFilter).toBe(1);
  publisher.reset();
  packet.bindings = [binding];
  publisher.sink.primitive(packet);
  expect(publisher.packets[0].bindings[0]).toBe(converted);
});

it("rejects a resource with no effect player layer", () => {
  expect(() => effectPlayerLayer(1)).toThrow(RangeError);
});
