/**
 * Device state of effect draws.
 *
 * Effect materials come in a few classes; each class maps to one complete render-state list, checked
 * once with the same compiler the note draws use. A material outside the listed classes is rejected
 * rather than drawn with a state this module cannot vouch for.
 */

import {
  compileDeviceState,
  type DeviceStateSet,
  type PackedStateCommand,
} from "../gpu/deviceState";
import { BLEND_ROWS } from "./eval/tables";

const ADDITIVE_DESTINATION = 2;
const ALPHA_DESTINATION = 6;
const BLEND_FACTORS = [1, 2, 3, 4, 5, 6, 9, 10, 7, 8, 11, 14] as const;

/** The state list of a blended effect draw; by default depth-tested and without depth writes. */
function blended(
  destination: number,
  alphaReference: number,
  depthTest = 1,
  depthWrite = 0,
  enabled = 1,
): PackedStateCommand[] {
  return [
    [27, enabled],
    [206, 0],
    [171, 1],
    [19, 5],
    [20, destination],
    [209, 1],
    [207, 1],
    [208, 1],
    [193, 4278321666],
    [15, 0],
    [24, alphaReference],
    [25, 5],
    [7, depthTest],
    [14, depthWrite],
    [23, 4],
    [195, 2147483648],
    [175, 2147483648],
    [52, 0],
    [53, 1],
    [54, 1],
    [55, 1],
    [56, 8],
    [57, 0],
    [58, 0],
    [59, 0],
    [22, 1],
    [174, 0],
    [168, 15],
    [8, 3],
  ];
}

/** Primitive materials: the flags word, the feature word beside it, and the destination blend. */
const PRIMITIVE_CLASSES: readonly (readonly [
  flags: number,
  features: number,
  destination: number,
])[] = [
  [0x2de004, 0x4020, ADDITIVE_DESTINATION],
  [0x2de004, 0x4420, ADDITIVE_DESTINATION],
  [0x2de184, 0x4020, ADDITIVE_DESTINATION],
  [0x2de003, 0x4020, ALPHA_DESTINATION],
];

/** Particle materials: the flags word and the destination blend. */
const PARTICLE_CLASSES: readonly (readonly [flags: number, destination: number])[] = [
  [0x2de004, ADDITIVE_DESTINATION],
];

const primitives = new Map<number, Map<number, DeviceStateSet>>();
for (const [flags, features, destination] of PRIMITIVE_CLASSES) {
  let byFeatures = primitives.get(flags);
  if (!byFeatures) primitives.set(flags, (byFeatures = new Map()));
  byFeatures.set(
    features,
    compileDeviceState(blended(destination, 1), `Effect primitive ${flags.toString(16)}`),
  );
}
const particles = new Map<number, DeviceStateSet>();
for (const [flags, destination] of PARTICLE_CLASSES)
  particles.set(
    flags,
    compileDeviceState(blended(destination, 0), `Effect particle ${flags.toString(16)}`),
  );

/**
 * The state of a primitive draw whose material has these flag and feature words.
 *
 * @throws RangeError when the material is not one of the supported classes.
 */
export function primitiveEffectState(flags: number, features: number): DeviceStateSet {
  const state = primitives.get(flags)?.get(features);
  if (!state)
    throw new RangeError(
      `Effect primitive material ${flags.toString(16)}/${features.toString(16)} is not supported`,
    );
  return state;
}

/**
 * The state of a particle draw whose material has these flags.
 *
 * @throws RangeError when the material is not one of the supported classes.
 */
export function particleEffectState(flags: number): DeviceStateSet {
  const state = particles.get(flags);
  if (!state)
    throw new RangeError(`Effect particle material ${flags.toString(16)} is not supported`);
  return state;
}

const depthParticles = new Map<number, DeviceStateSet>();

/**
 * Particle blend rows 1..7; depth test follows flag bit 0x40000 and depth writes bit 0x20000.
 *
 * @throws RangeError for mode 0, which inherits model state, or a mode outside the scene range.
 */
export function depthParticleEffectState(flags: number): DeviceStateSet {
  const known = depthParticles.get(flags);
  if (known) return known;
  const blend = flags & 63;
  if (blend === 0 || blend > 7)
    throw new RangeError(`Particle blend mode ${blend} is not supported`);
  const row = BLEND_ROWS[blend];
  const overrides = new Map<number, number>([
    [15, row[16]],
    [19, BLEND_FACTORS[row[4]]],
    [20, BLEND_FACTORS[row[8]]],
    [171, row[12] + 1],
    [168, (flags >>> 13) & 15],
  ]);
  const state = compileDeviceState(
    blended(
      blend === 4 ? ADDITIVE_DESTINATION : ALPHA_DESTINATION,
      0,
      flags & 0x40000 ? 1 : 0,
      flags & 0x20000 ? 1 : 0,
      row[0],
    ).map(([number, value]) => [number, overrides.get(number) ?? value]),
    `Particle ${flags.toString(16)}`,
  );
  depthParticles.set(flags, state);
  return state;
}

const depthPrimitives = new Map<number, DeviceStateSet>();

/**
 * The simple primitive's blend row, depth gates and RGBA write mask from its source flags.
 *
 * @throws RangeError for blend modes outside the scene node's 0..7 range.
 */
export function depthPrimitiveEffectState(flags: number): DeviceStateSet {
  const known = depthPrimitives.get(flags);
  if (known) return known;
  const blend = flags & 63;
  if (blend > 7) throw new RangeError(`Primitive blend mode ${blend} is not supported`);
  const row = BLEND_ROWS[blend];
  const commands = blended(
    blend === 4 ? ADDITIVE_DESTINATION : ALPHA_DESTINATION,
    1,
    flags & 0x40000 ? 1 : 0,
    flags & 0x20000 ? 1 : 0,
    row[0],
  );
  const overrides = new Map<number, number>([
    [15, row[16]],
    [19, BLEND_FACTORS[row[4]]],
    [20, BLEND_FACTORS[row[8]]],
    [171, row[12] + 1],
    [168, (flags >>> 13) & 15],
  ]);
  const state = compileDeviceState(
    commands.map(([number, value]) => [number, overrides.get(number) ?? value]),
    `Primitive ${flags.toString(16)}`,
  );
  depthPrimitives.set(flags, state);
  return state;
}

/** The command lists of every supported class, for checks against an independent derivation. */
export function effectStateCommands(): {
  primitives: readonly { flags: number; features: number; commands: PackedStateCommand[] }[];
  particles: readonly { flags: number; commands: PackedStateCommand[] }[];
} {
  return {
    primitives: PRIMITIVE_CLASSES.map(([flags, features, destination]) => ({
      flags,
      features,
      commands: blended(destination, 1),
    })),
    particles: PARTICLE_CLASSES.map(([flags, destination]) => ({
      flags,
      commands: blended(destination, 0),
    })),
  };
}
