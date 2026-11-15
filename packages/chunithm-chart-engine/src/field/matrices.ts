export function matrixToWebGL(m: ArrayLike<number>): Float32Array {
  if (m.length !== 16 || !Array.from(m).every(Number.isFinite))
    throw new TypeError("需要有限的 4×4 矩阵");
  return Float32Array.from({ length: 16 }, (_, i) => m[(i % 4) * 4 + Math.floor(i / 4)]);
}

export function affineToWebGL(m: readonly number[]): Float32Array {
  if (m.length !== 12 || !m.every(Number.isFinite)) throw new TypeError("需要有限的 3×4 矩阵");
  return Float32Array.of(
    m[0],
    m[4],
    m[8],
    0,
    m[1],
    m[5],
    m[9],
    0,
    m[2],
    m[6],
    m[10],
    0,
    m[3],
    m[7],
    m[11],
    1,
  );
}
