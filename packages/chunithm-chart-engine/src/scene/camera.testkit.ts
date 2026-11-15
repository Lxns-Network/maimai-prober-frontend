import type { FloatEnv } from "../stage/camera/math";
import type { PlayCameraInput, PlayCameraState } from "./camera";

export const ENV: FloatEnv = { fpcw: 0x037f, mxcsr: 0x1f80 };

const scratch = new DataView(new ArrayBuffer(4));

export function floatWord(value: number): number {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
}

export const NO_REFERENCE_NODE = 0xffffffff;

export function baseSettings(): number[] {
  const words = new Array<number>(0x17).fill(0);
  words[0x00 >> 2] = floatWord(-1);
  words[0x0c >> 2] = floatWord(27.5);
  words[0x10 >> 2] = floatWord(1);
  words[0x14 >> 2] = floatWord(1500);
  words[0x18 >> 2] = floatWord(-1);
  words[0x44 >> 2] = NO_REFERENCE_NODE;
  words[0x50 >> 2] = NO_REFERENCE_NODE;
  words[0x2c >> 2] = 0;
  return words;
}

export const STATES: readonly PlayCameraState[] = [
  { id: 0, position: [0, 57, 44], target: [0, 3, -146.5] },
  {
    id: 101,
    position: [0.014000000432133675, 57, 44],
    target: [0.1860000044107437, 3, -146.5],
  },
];

export function baseSnapshot(): {
  table: { words: number[][]; dirty: number[]; changed: number };
  view: number[];
  projection: number[];
  viewProjection: number[];
} {
  const words = Array.from({ length: 13 }, () => [0, 0, 0]);
  words[0] = [floatWord(1), 0, 0];
  words[1] = [floatWord(1500), 0, 0];
  words[2] = [floatWord(27.5), 0, 0];
  words[3] = [floatWord(1), 0, 0];
  words[4] = [floatWord(1), 0, 0];
  words[5] = [floatWord(1), 0, 0];
  words[6] = [1, 0, 0];
  words[8] = [0, 0, floatWord(200)];
  words[10] = [0, floatWord(1), 0];
  const dirty = Array.from({ length: 13 }, (_, i) => (i === 2 || i === 8 ? 1 : 0));
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return {
    table: { words, dirty, changed: 1 },
    view: identity,
    projection: identity,
    viewProjection: identity,
  };
}

export function baseInput(overrides: Partial<PlayCameraInput> = {}): PlayCameraInput {
  return {
    resource: { settings: baseSettings(), states: STATES },
    initial: baseSnapshot(),
    state: 0,
    world: [0, 0, 0],
    environment: ENV,
    ...overrides,
  };
}

export function bitsOf(values: ArrayLike<number>): number[] {
  return Array.from(new Uint32Array(Float32Array.from(values).buffer));
}
