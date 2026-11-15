import type { Mat4 } from "./math";

const f = Math.fround;

/** Inverts a row-major matrix with scaled partial-pivot LU; singular inputs are copied unchanged. */
export function invert(m: Mat4): Mat4 {
  const rows = Array.from({ length: 4 }, (_, index) =>
    Float32Array.from(m.subarray(index * 4, index * 4 + 4)),
  );
  const scale = rows.map((row) => {
    const maximum = Math.max(...Array.from(row, Math.abs));
    return maximum === 0 ? 0 : f(1 / maximum);
  });
  if (scale.some((value) => value === 0)) return m.slice();
  const order = [0, 1, 2, 3];
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    let largest = Math.abs(f(rows[order[column]][column] * scale[order[column]]));
    for (let row = column + 1; row < 4; row++) {
      const value = Math.abs(f(rows[order[row]][column] * scale[order[row]]));
      if (value > largest) {
        largest = value;
        pivot = row;
      }
    }
    [order[column], order[pivot]] = [order[pivot], order[column]];
    const active = rows[order[column]];
    if (active[column] === 0) return m.slice();
    for (let row = column + 1; row < 4; row++) {
      const target = rows[order[row]];
      target[column] = f(target[column] / active[column]);
      for (let next = column + 1; next < 4; next++)
        target[next] = f(target[next] - f(active[next] * target[column]));
    }
  }
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    const rhs = order.map((index) => Number(index === column));
    for (let row = 0; row < 4; row++)
      for (let next = row + 1; next < 4; next++)
        rhs[next] = f(rhs[next] - f(rows[order[next]][row] * rhs[row]));
    for (let row = 3; row >= 0; row--) {
      for (let next = row + 1; next < 4; next++)
        rhs[row] = f(rhs[row] - f(rows[order[row]][next] * rhs[next]));
      rhs[row] = f(rhs[row] / rows[order[row]][row]);
      result[row * 4 + column] = rhs[row];
    }
  }
  return result;
}
