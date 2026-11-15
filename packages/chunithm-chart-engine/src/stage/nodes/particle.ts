import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import {
  nthElement,
  type ColorElement,
  type TextureElement,
  type MaterialElement,
} from "../elements";
import {
  advanceParticle,
  createParticleState,
  readParticleProgram,
  type ParticleProgram,
  type ParticleState,
} from "../../effects/eval/particle";
import {
  drawSourceFlags,
  elementSampler,
  particleFeatureWord,
  type ParticleDrawState,
  type TextureBinding,
} from "../../effects/eval/draw";
import { nextParticleState } from "../../effects/eval/random";
import { BLEND_ROWS } from "../../effects/eval/tables";
import { BLANK_TEXTURE } from "./primitive3d";

export const PARTICLE_TYPE = 6001008;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const MATERIAL_ELEMENT = 6003002;
const INITIAL_CRT_STATE = 1;
/** Values a particle node draws from the stream when it is built. */
const PARTICLE_DRAWS = 3;

/** What a particle node draws with: its texture binding, source flags and the feature word of its blend row. */
export type StageParticleDraw = { -readonly [K in keyof ParticleDrawState]: ParticleDrawState[K] };

export interface StageParticle {
  readonly program: ParticleProgram;
  readonly state: ParticleState;
  readonly draw: StageParticleDraw;
  readonly material: MaterialElement | null;
  readonly texture: TextureElement;
  readonly bindings: readonly TextureBinding[];
}

type ParticleExtension = StageParticle | { readonly unsupported: string };

function crtStream(scene: StageScene): { crt: number } {
  return sceneState(scene, "particle.crt", () => ({ crt: INITIAL_CRT_STATE }));
}

function unsupported(reason: string): never {
  throw new RangeError(reason);
}

function readDraw(node: StageNode): Pick<StageParticle, "draw" | "texture" | "bindings"> {
  const g = node.scene.graph;
  const record = node.record!;
  const materials = record.elements.filter((e) => e.type === MATERIAL_ELEMENT);
  let softEdgeDistance: number | undefined;
  let rgbScale = 1;
  let refractionMode: 1 | 2 | undefined;
  let refractionParameter: number | undefined;
  let materialBlend = -1;
  if (materials.length > 1) unsupported("particle node with multiple material elements");
  if (materials.length === 1) {
    const data = g.pointer(materials[0].offset + 0x14);
    if (data === null) unsupported("particle material without settings");
    const values = Array.from({ length: 12 }, (_, i) => g.u32(data + i * 4));
    const defaults = [
      0x3f800000, 0x3f800000, 0x3f800000, 0, 0, 0x3f800000, 0xffffffff, 0x3f800000, 0, 0xffffffff,
    ];
    if (values[0] > 3 || defaults.some((value, i) => i !== 5 && i !== 6 && values[i + 2] !== value))
      unsupported("particle material settings");
    materialBlend = g.i32(data + 32);
    if (materialBlend > 7) unsupported(`particle material blend mode ${materialBlend}`);
    rgbScale = g.f32(data + 28);
    if (!Number.isFinite(rgbScale)) unsupported("particle material RGB scale");
    if (values[0] === 1) softEdgeDistance = g.f32(data + 4);
    if (values[0] === 2 || values[0] === 3) {
      refractionMode = values[0] === 2 ? 1 : 2;
      refractionParameter = g.f32(data + 4);
      if (!Number.isFinite(refractionParameter)) unsupported("particle refraction parameter");
    }
    if (
      softEdgeDistance !== undefined &&
      (!Number.isFinite(softEdgeDistance) || softEdgeDistance <= 0)
    )
      unsupported("particle soft-edge distance");
  }
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
  if (!texture || texture.data === null) unsupported("particle node without a texture element");
  const references = g.pointer(texture.record.offset + 8);
  const blank = texture.textures < 1;
  if (references === null && !blank) unsupported("particle node without a texture");
  const words = Array.from({ length: 13 }, (_, i) => g.u32(texture.data! + i * 4));
  let flags = drawSourceFlags(
    g.i32(record.offset + 12),
    record.flags,
    record.elements
      .filter((e) => e.type === TEXTURE_ELEMENT)
      .map((e) => {
        const data = g.pointer(e.offset + 0x14);
        return data === null ? null : g.u32(data + 8);
      }),
  );
  if (materialBlend > 0) flags = (flags & ~63) | materialBlend;
  const blend = flags & 63;
  if (blend === 0) unsupported("particle blend mode 0 inherits the model state");
  const sampler = elementSampler(words);
  const bindings: TextureBinding[] = Array.from(
    { length: blank ? 1 : texture.textures },
    (_, index) => ({
      elementOffset: texture.record.offset,
      referenceOrdinal: index,
      resourceIndex: blank ? BLANK_TEXTURE : g.u32(references! + index * 8),
      referenceValue: blank ? 0 : g.u32(references! + index * 8 + 4),
      parameterWords: words,
      sampler,
    }),
  );
  const draw: StageParticleDraw = {
    binding: bindings[texture.texture],
    sourceFlags: flags,
    featureWord144:
      particleFeatureWord(record.drawCoordinateMode, BLEND_ROWS[blend]) |
      (softEdgeDistance !== undefined ? 0x400 : refractionMode !== undefined ? 0x220 : 0),
    softEdgeDistance,
    rgbScale,
    refractionMode,
    refractionParameter,
  };
  return { draw, texture, bindings };
}

/** The basic particle node: emission follows the node's age and world matrix; the particles themselves are evaluated at draw time. */
export const particleNode: NodeBehavior = {
  type: PARTICLE_TYPE,
  construct(node) {
    const settings = node.record!.settings;
    const stream = crtStream(node.scene);
    const crt = stream.crt;
    for (let i = 0; i < PARTICLE_DRAWS; i++) stream.crt = nextParticleState(stream.crt);
    try {
      if (settings === null) unsupported("particle node without settings");
      const program = readParticleProgram(node.scene.graph, settings);
      const draw = readDraw(node);
      const [state] = createParticleState(program, crt, node.scene.options.maximumParticles);
      node.extension = {
        program,
        state,
        ...draw,
        material: nthElement<MaterialElement>(node, MATERIAL_ELEMENT, 0),
      } satisfies StageParticle;
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${PARTICLE_TYPE}: ${error.message}`);
      node.extension = { unsupported: error.message } satisfies ParticleExtension;
    }
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const particle = stageParticle(node);
    if (particle) {
      particle.draw.binding = particle.bindings[particle.texture.texture];
      if (particle.material) {
        const { draw, material } = particle;
        draw.rgbScale = material.values[5];
        if (draw.softEdgeDistance !== undefined) draw.softEdgeDistance = material.values[0];
        if (draw.refractionMode === 1) draw.refractionParameter = material.values[0];
      }
      advanceParticle(particle.program, particle.state, node.controller!.age, node.world);
    }
  },
};

/** The state of the scene's particle random stream: the value its next draw advances from. */
export function stageParticleStream(scene: StageScene): number {
  return crtStream(scene).crt;
}

/** The particle data of a node whose class could be built, or null. */
export function stageParticle(node: StageNode): StageParticle | null {
  const extension = node.extension as ParticleExtension | undefined;
  return extension && "program" in extension ? extension : null;
}

/** Whether the draw pass submits the node: it has been updated and no blocking flag is set. */
export function stageParticleDrawable(node: StageNode): boolean {
  return stageNodeDrawable(node);
}

/** The node's colour as the packed word its colour element holds. */
export function stageParticleColor(node: StageNode): number {
  return nthElement<ColorElement>(node, COLOR_ELEMENT, 0)?.color ?? 0xffffffff;
}
