/**
 * Draw-order depth of a model part or a primitive, for one camera.
 *
 * Every product and sum is a binary32 step: each operand and each rounded result must be a finite
 * normal number or zero, and anything else is refused with a RangeError instead of ordering draws
 * by a value the arithmetic does not define.
 */

/** Floating-point environment the arithmetic is defined for. */
export interface SortDepthEnvironment {
  readonly fpcw: number;
  readonly mxcsr: number;
}

export interface SortDepthCamera {
  /** Depth of a model part from its joint's row-major 3x4 matrix and its material's offset. */
  model(jointMatrix3x4: ArrayLike<number>, sortDistanceOffset: number): number;
  /** Depth of a primitive from its sort position and offset. */
  primitive(sortPosition: ArrayLike<number>, sortDistanceOffset: number): number;
}

const SMALLEST_NORMAL = 2 ** -126;
const ROUNDS_TO_INFINITY = 2 ** 128 - 2 ** 103;
const ENVIRONMENT_WORDS: readonly number[] = [0x007f, 0x027f, 0x037f];

const refuseValue = (): never => {
  throw new RangeError("排序运算仅支持有限正规数和零");
};

const refuseLength = (): never => {
  throw new RangeError("排序矩阵或向量长度错误");
};

const refuseBinary32 = (): never => {
  throw new RangeError("需要原始有限 binary32 值");
};

const normal = (value: number): number => {
  if (value - value !== 0) return refuseValue();
  if (value !== 0 && Math.abs(value) < SMALLEST_NORMAL) return refuseValue();
  return value;
};

const step = (value: number): number => {
  const magnitude = value < 0 ? -value : value;
  if (magnitude >= SMALLEST_NORMAL && magnitude < ROUNDS_TO_INFINITY) return Math.fround(value);
  if (value === 0) return value;
  return refuseValue();
};

const element = (value: number): number => {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return refuseBinary32();
  return normal(value);
};

const loadMatrix = (values: ArrayLike<number>, into: Float64Array): void => {
  if (!values || values.length !== 16) refuseLength();
  for (let i = 0; i < 16; i++) into[i] = element(values[i]);
};

/** Validates both camera matrices once; the returned functions then only read them. */
export function createSortDepthCamera(
  cameraA: ArrayLike<number>,
  cameraB: ArrayLike<number>,
  environment: SortDepthEnvironment,
): SortDepthCamera {
  if (!environment || !ENVIRONMENT_WORDS.includes(environment.fpcw) || environment.mxcsr !== 0x1f80)
    throw new RangeError("排序浮点环境超出已验证范围");
  const a = new Float64Array(16);
  const b = new Float64Array(16);
  loadMatrix(cameraA, a);
  loadMatrix(cameraB, b);
  const a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3];
  const a4 = a[4],
    a5 = a[5],
    a6 = a[6],
    a7 = a[7];
  const a8 = a[8],
    a9 = a[9],
    a10 = a[10],
    a11 = a[11];
  const a12 = a[12],
    a13 = a[13],
    a14 = a[14],
    a15 = a[15];
  const b8 = b[8],
    b9 = b[9],
    b10 = b[10],
    b11 = b[11];

  const depth = (x: number, y: number, z: number, offset: number, model: boolean): number => {
    const q0 = step(step(step(step(a1 * y) + step(a0 * x)) + step(a2 * z)) + a3);
    const q1 = step(step(step(step(a5 * y) + step(a4 * x)) + step(a6 * z)) + a7);
    const q2 = step(step(step(step(a9 * y) + step(a8 * x)) + step(a10 * z)) + a11);
    const q3 = step(step(step(step(a13 * y) + step(a12 * x)) + step(a14 * z)) + a15);
    const depthZ = model ? normal(Math.fround(offset + q2)) : step(offset + q2);
    return step(step(step(step(b9 * q1) + step(b8 * q0)) + step(b10 * depthZ)) + step(b11 * q3));
  };

  const camera: SortDepthCamera = {
    model(jointMatrix3x4, sortDistanceOffset) {
      if (!jointMatrix3x4 || jointMatrix3x4.length !== 12) refuseLength();
      let x = 0;
      let y = 0;
      let z = 0;
      for (let i = 0; i < 12; i++) {
        const value = element(jointMatrix3x4[i]);
        if (i === 3) x = value;
        else if (i === 7) y = value;
        else if (i === 11) z = value;
      }
      return depth(x, y, z, element(sortDistanceOffset), true);
    },
    primitive(sortPosition, sortDistanceOffset) {
      if (!sortPosition || sortPosition.length !== 3) refuseLength();
      const x = element(sortPosition[0]);
      const y = element(sortPosition[1]);
      const z = element(sortPosition[2]);
      return depth(x, y, z, element(sortDistanceOffset), false);
    },
  };
  return Object.freeze(camera);
}
