const f = Math.fround;

/** Which tile of the 5x5 grid feeds which channel: 0 none, 1 first channel, 2 second channel. */
const DIRECT = [0, 0, 0, 0, 0, 2, 2, 0, 2, 2, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 2, 0];
const MIRROR = [0, 2, 0, 1, 0, 0, 2, 0, 1, 1, 0, 0, 0, 0, 0, 0, 2, 0, 1, 2, 0, 2, 0, 1, 0];

/** The blend-area lookup of the morphological anti-aliasing filter: two bytes per texel. */
export interface MlaaArea {
  readonly size: number;
  readonly texels: Uint8Array;
}

/** Builds the lookup for a distance: a 5x5 grid of tiles, each `distance + 1` texels wide. */
export function buildMlaaArea(distance: number): MlaaArea {
  const tile = distance + 1;
  const base = new Float32Array(tile * tile);
  for (let i = 0; i < tile; i++) {
    base[i * tile + i] = f(0.125 / (2 * i + 1));
    for (let j = i + 1; j < tile; j++)
      base[i * tile + j] =
        i === 0
          ? f(f(f(f(j - 1) * 0.25) / (j + 1)) + 0.25)
          : f(f(f(2 * (j - i)) * 0.25) * f(1 / (j + i + 1)));
  }
  const size = tile * 5;
  const texels = new Uint8Array(size * size * 2);
  for (let k = 0; k < 25; k++) {
    const row = Math.floor(k / 5) * tile;
    const column = (k % 5) * tile;
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        let first = 0;
        let second = 0;
        const direct = base[y * tile + x];
        const mirror = base[x * tile + y];
        if (DIRECT[k] === 1) first = direct;
        else if (DIRECT[k] === 2) second = direct;
        if (MIRROR[k] === 1) first = f(first + mirror);
        else if (MIRROR[k] === 2) second = f(second + mirror);
        const at = ((row + y) * size + column + x) * 2;
        texels[at] = Math.trunc(f(f(first * 255) + 0.5));
        texels[at + 1] = Math.trunc(f(f(second * 255) + 0.5));
      }
  }
  return { size, texels };
}
