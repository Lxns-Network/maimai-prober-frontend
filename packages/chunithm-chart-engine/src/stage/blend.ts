/** Blend rows a node can select: enable, source, destination, operation, then the alpha test bit (bit 0) and separate-alpha bit (bit 8), and three alpha factor fields. */
const BLEND_ROWS: readonly (readonly number[])[] = [
  [0, 4, 5, 0, 0, 0, 0, 0],
  [0, 4, 5, 0, 1, 0, 0, 0],
  [1, 4, 5, 0, 1, 0, 0, 0],
  [1, 4, 5, 0, 0, 0, 0, 0],
  [1, 4, 1, 0, 0, 0, 0, 0],
  [1, 4, 1, 2, 0, 0, 0, 0],
  [1, 0, 2, 0, 0, 0, 0, 0],
];

const NODE_FLAG_DEPTH_WRITE_OFF = 0x10;
const NODE_FLAG_DEPTH_TEST_OFF = 0x20;
const SORT_FLAG_BLEND = 0x20;
const SORT_FLAG_ALPHA_TEST = 0x40;

/** The blend and depth state a model node forces onto every shape it draws, as device-state values. */
export interface StageBlend {
  readonly enable: number;
  readonly source: number;
  readonly destination: number;
  readonly operation: number;
  readonly alphaTest: number;
  readonly depthTest: number;
  readonly depthWrite: number;
}

/**
 * The state override of a node from its header flags and blend row; null while the row is zero.
 *
 * @throws RangeError for rows outside the supported table or rows that use separate alpha factors.
 */
export function stageNodeBlend(flags: number, row: number): StageBlend | null {
  if (row === 0) return null;
  const entry = BLEND_ROWS[Math.min(row, 7)];
  if (row < 0 || !entry || (entry[4] & ~1) !== 0)
    throw new RangeError(`Stage node: blend row ${row} is not supported`);
  return {
    enable: entry[0],
    source: entry[1] + 1,
    destination: entry[2] + 1,
    operation: entry[3] + 1,
    alphaTest: entry[4] & 1,
    depthTest: flags & NODE_FLAG_DEPTH_TEST_OFF ? 0 : 1,
    depthWrite: flags & NODE_FLAG_DEPTH_WRITE_OFF ? 0 : 1,
  };
}

/** The mesh sorting flags an overridden draw carries: translucent while blending, alpha tested while testing. */
export function stageBlendSortFlags(blend: StageBlend): number {
  return (blend.enable ? SORT_FLAG_BLEND : 0) | (blend.alphaTest ? SORT_FLAG_ALPHA_TEST : 0);
}
