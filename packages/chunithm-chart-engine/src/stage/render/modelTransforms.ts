const f = Math.fround;

/** Column-major 4x4 of a row-major 3x4 matrix. */
export function rowsToColumns(r: ArrayLike<number>): Float32Array {
  return Float32Array.of(
    r[0],
    r[4],
    r[8],
    0,
    r[1],
    r[5],
    r[9],
    0,
    r[2],
    r[6],
    r[10],
    0,
    r[3],
    r[7],
    r[11],
    1,
  );
}

export function transpose(m: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) out[column * 4 + row] = m[row * 4 + column];
  return out;
}

export function affineRows(m: ArrayLike<number>): Float32Array {
  return Float32Array.of(
    m[0],
    m[4],
    m[8],
    m[12],
    m[1],
    m[5],
    m[9],
    m[13],
    m[2],
    m[6],
    m[10],
    m[14],
  );
}

export function multiplyColumns(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  out: Float32Array,
): void {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] = f(
        f(f(a[r] * b[c * 4]) + f(a[4 + r] * b[c * 4 + 1])) +
          f(f(a[8 + r] * b[c * 4 + 2]) + f(a[12 + r] * b[c * 4 + 3])),
      );
}

export function unpackColor(packed: number): number[] {
  const scale = f(1 / 255);
  return [0, 8, 16, 24].map((shift) => f(((packed >>> shift) & 255) * scale));
}

export function casterSphere(
  sphere: ArrayLike<number>,
  world: Float32Array,
): [number, number, number, number] {
  const x = sphere[0],
    y = sphere[1],
    z = sphere[2],
    radius = sphere[3];
  return [
    f(f(f(f(world[4] * y) + f(world[0] * x)) + f(world[8] * z)) + world[12]),
    f(f(f(f(world[5] * y) + f(world[1] * x)) + f(world[9] * z)) + world[13]),
    f(f(f(f(world[6] * y) + f(world[2] * x)) + f(world[10] * z)) + world[14]),
    radius,
  ];
}
