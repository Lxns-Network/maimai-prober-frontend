/** State of the effect node random stream: the low and high words of one 64-bit value. */
export interface EffectRandom {
  low: number;
  high: number;
}

/** Advances the effect node stream one step, writing the next state into `out` (which may be `state`). */
export function advanceEffectRandom(state: EffectRandom, out: EffectRandom): void {
  const lo = (state.low ^ ((-1400276635 << (state.low & 3)) >>> 0)) >>> 0;
  const hi = state.high >>> 0;
  const aLo = (lo ^ (lo << 1)) >>> 0;
  const aHi = (hi ^ ((hi << 1) | (lo >>> 31))) >>> 0;
  const bLo = (lo ^ ((lo >>> 1) | (hi << 31))) >>> 0;
  const bHi = (hi ^ (hi >>> 1)) >>> 0;
  out.low = (lo ^ (aLo << 2) ^ ((bLo >>> 2) | (bHi << 30))) >>> 0;
  out.high = (hi ^ ((aHi << 2) | (aLo >>> 30)) ^ (bHi >>> 2)) >>> 0;
}

/** The value the particle stream draws from `state`; the next state is `state * 214013 + 2531011`. */
export function nextParticleRandom(state: number): number {
  return (((Math.imul(state, 0x343fd) + 0x269ec3) >>> 0) >>> 16) & 0x7fff;
}

export function nextParticleState(state: number): number {
  return (Math.imul(state, 0x343fd) + 0x269ec3) >>> 0;
}

const f = Math.fround;
const TWO_PI = 2 * Math.PI;

function sinPolynomial(value: number): number {
  const square = value * value;
  return (
    ((((square * 0.000002755731922398589 - 0.0001984126984126984) * square + 0.008333333333333333) *
      square -
      0.1666666666666667) *
      square +
      1) *
    value
  );
}

function cosPolynomial(value: number): number {
  const square = value * value;
  return (
    (((square * 0.0000248015873015873 - 0.001388888888888889) * square + 0.04166666666666666) *
      square -
      0.5) *
      square +
    1
  );
}

function turnFraction(value: number): number {
  const turns = value * 0.1591549430918953 + 0.125;
  return turns - Math.trunc(turns) - 0.125;
}

/** Sine and cosine evaluated in double precision and stored as float32. */
function sinCos(angle: number, out: Float64Array): void {
  const c = turnFraction(Math.abs(angle));
  const s = turnFraction(angle < 0 ? Math.PI - angle : angle);
  out[1] = f(
    c >= 0.625
      ? sinPolynomial((c - 0.75) * TWO_PI)
      : c >= 0.375
        ? -cosPolynomial((c - 0.5) * TWO_PI)
        : c >= 0.125
          ? -sinPolynomial((c - 0.25) * TWO_PI)
          : cosPolynomial(c * TWO_PI),
  );
  out[0] = f(
    s >= 0.625
      ? -cosPolynomial((s - 0.75) * TWO_PI)
      : s >= 0.375
        ? -sinPolynomial((s - 0.5) * TWO_PI)
        : s >= 0.125
          ? cosPolynomial((s - 0.25) * TWO_PI)
          : sinPolynomial(s * TWO_PI),
  );
}

const matrix = new Float64Array(12);
const trig = new Float64Array(2);

/** Writes into `matrix` the rotation turning about X, Y and Z by the three angles in that order. */
function rotationMatrix(x: number, y: number, z: number): void {
  matrix.fill(0);
  matrix[0] = matrix[5] = matrix[10] = 1;
  for (let axis = 0; axis < 3; axis++) {
    sinCos(axis === 0 ? x : axis === 1 ? y : z, trig);
    const sin = trig[0];
    const cos = trig[1];
    const p = axis === 0 ? 1 : 0;
    const q = axis === 2 ? 1 : 2;
    for (let row = 0; row < 3; row++) {
      const a = matrix[row * 4 + p];
      const b = matrix[row * 4 + q];
      if (axis === 1) {
        matrix[row * 4 + p] = f(f(b * -sin) + f(a * cos));
        matrix[row * 4 + q] = f(f(a * sin) + f(b * cos));
      } else {
        matrix[row * 4 + p] = f(f(b * sin) + f(a * cos));
        matrix[row * 4 + q] = f(f(a * -sin) + f(b * cos));
      }
    }
  }
}

/**
 * The unit quaternion of the rotation three particle draws select: each draw modulo 1024 turns about
 * X, Y and Z in that order. Written into `out` as x, y, z, w.
 */
export function particleRandomRotation(
  a: number,
  b: number,
  c: number,
  out: Float32Array | number[],
): void {
  const unit = f(0.0080645159);
  rotationMatrix(f((a % 1024) * unit), f((b % 1024) * unit), f((c % 1024) * unit));
  const x = matrix[0];
  const y = matrix[5];
  const z = matrix[10];
  const trace = f(f(x + y) + z);
  let q0: number, q1: number, q2: number, q3: number;
  if (trace >= 0) {
    const root = f(Math.sqrt(f(trace + 1)));
    const factor = f(-0.5 / root);
    q0 = f(f(matrix[6] - matrix[9]) * factor);
    q1 = f(f(matrix[8] - matrix[2]) * factor);
    q2 = f(f(matrix[1] - matrix[4]) * factor);
    q3 = f(root * 0.5);
  } else {
    const axis = z > (y > x ? y : x) ? 2 : y > x ? 1 : 0;
    const root = f(
      Math.sqrt(
        axis === 0
          ? f(f(f(x - y) - z) + 1)
          : axis === 1
            ? f(f(f(y - x) - z) + 1)
            : f(f(z - f(x + y)) + 1),
      ),
    );
    const factor = f(0.5 / root);
    if (axis === 0) {
      q0 = f(root * 0.5);
      q1 = f(f(matrix[4] + matrix[1]) * factor);
      q2 = f(f(matrix[8] + matrix[2]) * factor);
      q3 = -f(f(matrix[6] - matrix[9]) * factor);
    } else if (axis === 1) {
      q0 = f(f(matrix[4] + matrix[1]) * factor);
      q1 = f(root * 0.5);
      q2 = f(f(matrix[9] + matrix[6]) * factor);
      q3 = -f(f(matrix[8] - matrix[2]) * factor);
    } else {
      q0 = f(f(matrix[8] + matrix[2]) * factor);
      q1 = f(f(matrix[9] + matrix[6]) * factor);
      q2 = f(root * 0.5);
      q3 = -f(f(matrix[1] - matrix[4]) * factor);
    }
  }
  const norm = f(Math.sqrt(f(f(f(f(q0 * q0) + f(q1 * q1)) + f(q2 * q2)) + f(q3 * q3))));
  let scale = 1;
  if (norm !== 0) {
    const reciprocal = f(1 / norm);
    scale = f(f(reciprocal + reciprocal) - f(f(reciprocal * reciprocal) * norm));
  }
  out[0] = norm === 0 ? q0 : f(q0 * scale);
  out[1] = norm === 0 ? q1 : f(q1 * scale);
  out[2] = norm === 0 ? q2 : f(q2 * scale);
  out[3] = norm === 0 ? q3 : f(q3 * scale);
}

/**
 * The eight particle direction rings, ordered by shape, then small capacity, then reverse birth order
 * (the same order as the ring index). Each ring holds twice its capacity of xyz-and-birth entries.
 */
export function particleTangentRings(maximumParticles: number): Float32Array[] {
  const words = new Uint32Array(624);
  words[0] = 1;
  for (let i = 1; i < 624; i++)
    words[i] = (i + Math.imul(1812433253, words[i - 1] ^ (words[i - 1] >>> 30))) >>> 0;
  let index = 0;
  const next = (): number => {
    const following = index < 623 ? index + 1 : 0;
    const joined = (words[index] & 0x80000000) | (words[following] & 0x7fffffff);
    const remote = index >= 227 ? index - 227 : index + 397;
    const value = ((joined >>> 1) ^ (words[following] & 1 ? 2567483615 : 0) ^ words[remote]) >>> 0;
    words[index] = value;
    index = following;
    let tempered = value ^ (value >>> 11);
    tempered ^= (tempered & 4282013869) << 7;
    tempered ^= (tempered & 4294958988) << 15;
    return ((tempered ^ (tempered >>> 18)) >>> 0) % 0xffff;
  };
  const unit = f(0.000015259022);
  const turn = f(0.00038350106);
  const rings: Float32Array[] = [];
  for (let shape = 0; shape < 2; shape++)
    for (let small = 0; small < 2; small++)
      for (let reverse = 0; reverse < 2; reverse++) {
        const count = small ? Math.floor(maximumParticles / 5) : maximumParticles;
        const ring = new Float32Array(count * 8);
        const step = reverse ? -1 : 1;
        const start = reverse ? 2 * count : 0;
        for (let i = 0; i < count; i++) {
          let v = f(f(next()) * unit);
          let x = f(f(v + v) - 1);
          v = f(f(next()) * unit);
          let y = f(f(v + v) - 1);
          v = f(f(next()) * unit);
          let z = f(f(v + v) - 1);
          if (shape === 0) {
            const ax = f(f(next()) * turn);
            const ay = f(f(next()) * turn);
            const az = f(f(next()) * turn);
            rotationMatrix(ax, ay, az);
            const rx = f(f(f(matrix[1] * y) + f(matrix[0] * x)) + f(matrix[2] * z));
            const ry = f(f(f(matrix[5] * y) + f(matrix[4] * x)) + f(matrix[6] * z));
            const rz = f(f(f(matrix[9] * y) + f(matrix[8] * x)) + f(matrix[10] * z));
            x = rx;
            y = ry;
            z = rz;
            const length = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
            if (length !== 0) {
              const inverse = f(1 / length);
              x = f(x * inverse);
              y = f(y * inverse);
              z = f(z * inverse);
            }
            const radius = f(f(next()) * unit);
            x = f(x * radius);
            y = f(y * radius);
            z = f(z * radius);
          }
          ring[i * 4] = ring[(i + count) * 4] = x;
          ring[i * 4 + 1] = ring[(i + count) * 4 + 1] = y;
          ring[i * 4 + 2] = ring[(i + count) * 4 + 2] = z;
          ring[i * 4 + 3] = start + step * i;
          ring[(i + count) * 4 + 3] = start + step * (i + count);
        }
        rings.push(ring);
      }
  return rings;
}
