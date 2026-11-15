import { expect, it } from "vitest";
import {
  advanceParticle,
  createParticleState,
  particleDrawRange,
  type ParticleProgram,
} from "./particle";

it("matches native interpolated particle births, including the reversed draw ring", () => {
  const parameters = new Float32Array(236);
  parameters[2] = 2;
  const source: ParticleProgram = {
    rate: 4,
    capacity: 20,
    lifetime: 2,
    timeOffset: 0,
    emitMode: 0,
    emitLimit: 0,
    initiallyEmitting: true,
    property: 1,
    reverse: false,
    box: false,
    minimumDistance: 0,
    maximumDistance: 1000000000,
    parameters,
  };
  const transform = (x: number, rotated: boolean) =>
    Float32Array.of(
      rotated ? 0 : 1,
      rotated ? 1 : 0,
      0,
      0,
      rotated ? -1 : 0,
      rotated ? 0 : 1,
      0,
      0,
      0,
      0,
      1,
      0,
      x,
      0,
      0,
      1,
    );
  // 0x6c8bf0 with fixture-owned shape, matrices and draw buffers.
  const expected = [
    [12, 0, 32767],
    [17, 6392, 32137],
    [22, 12539, 30272],
    [27, 18204, 27244],
    [32, 23169, 23169],
    [37, 23169, 23169],
    [42, 23169, 23169],
    [47, 23169, 23169],
  ];
  for (const reverse of [false, true]) {
    const program = { ...source, reverse };
    const [state] = createParticleState(program, 1, 20);
    advanceParticle(program, state, 0, transform(12, false));
    advanceParticle(program, state, 1, transform(12, false));
    advanceParticle(program, state, 2, transform(32, true));
    advanceParticle(program, state, 3, transform(52, true));
    const range = { small: false, start: 0, count: 0, shaderTime: 0 };
    particleDrawRange(program, state.time, 20, range);
    expect([range.start, range.count]).toEqual(reverse ? [28, 8] : [4, 8]);
    const rows = Array.from({ length: range.count }, (_, i) => {
      const at = (range.start + i) * 7;
      const births = state.births!;
      return [births[at], Math.round(births[at + 5] * 32767), Math.round(births[at + 6] * 32767)];
    });
    expect(rows).toEqual(reverse ? expected.slice().reverse() : expected);
  }
});

it("initializes the full first birth batch for a Stage 4801 emitter", () => {
  const parameters = new Float32Array(236);
  parameters[2] = 2;
  const program: ParticleProgram = {
    rate: 1,
    capacity: 1000,
    lifetime: 60,
    timeOffset: 500,
    emitMode: 0,
    emitLimit: 0,
    initiallyEmitting: true,
    property: 1,
    reverse: false,
    box: true,
    minimumDistance: 0,
    maximumDistance: 1000000000,
    parameters,
  };
  const [state] = createParticleState(program, 1);
  const matrix = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 11, 22, 33, 1);
  advanceParticle(program, state, 0, matrix);

  const range = { small: false, start: 0, count: 0, shaderTime: 0 };
  particleDrawRange(program, state.time, 10000, range);
  expect([range.start, range.count, state.birthCursor, state.birthWrapped]).toEqual([
    440, 60, 500, 0,
  ]);
  for (let i = range.start; i < range.start + range.count; i++)
    expect(Array.from(state.births!.subarray(i * 7, i * 7 + 7))).toEqual([11, 22, 33, 0, 0, 0, 1]);
});

it("keeps native draw-ring contents when births cross the capacity boundary", () => {
  const parameters = new Float32Array(236);
  parameters[2] = 2;
  const source: ParticleProgram = {
    rate: 4,
    capacity: 20,
    lifetime: 2,
    timeOffset: 0,
    emitMode: 0,
    emitLimit: 0,
    initiallyEmitting: true,
    property: 1,
    reverse: false,
    box: false,
    minimumDistance: 0,
    maximumDistance: 1000000000,
    parameters,
  };
  const expected = [
    [40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5],
    [50, 52.5, 55, 57.5, 60, 62.5, 65, 67.5],
  ];
  for (const reverse of [false, true]) {
    const program = { ...source, reverse };
    const [state] = createParticleState(program, 1, 20);
    const matrix = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    advanceParticle(program, state, 0, matrix);
    for (let age = 1; age <= 7; age++) {
      matrix[12] = age * 10;
      advanceParticle(program, state, age, matrix);
      if (age < 6) continue;
      const range = { small: false, start: 0, count: 0, shaderTime: 0 };
      particleDrawRange(program, state.time, 20, range);
      const rows = Array.from(
        { length: range.count },
        (_, i) => state.births![(range.start + i) * 7],
      );
      expect(rows).toEqual(reverse ? expected[age - 6].slice().reverse() : expected[age - 6]);
    }
  }
});
