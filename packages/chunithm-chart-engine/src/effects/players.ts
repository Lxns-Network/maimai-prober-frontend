export const KEY_BEAM_RESOURCE = 43;

const LAYERS: readonly (readonly [number, readonly number[]])[] = [
  [0, [14, 15, 16, 17, 18, 19, 20, 21, 51]],
  [12, [KEY_BEAM_RESOURCE]],
  [30, [2, 3, 4, 5, 6, 7, 8, 45, 48, 60]],
  [33, [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 62, 63]],
  [34, [22, 44, 50]],
];

const BY_RESOURCE = new Map<number, number>();
for (const [layer, ids] of LAYERS) for (const id of ids) BY_RESOURCE.set(id, layer);

/** The layer an effect resource's player publishes for draw ordering. */
export function effectPlayerLayer(resourceId: number): number {
  const layer = BY_RESOURCE.get(resourceId);
  if (layer === undefined)
    throw new RangeError(`Effect resource ${resourceId} has no player layer`);
  return layer;
}
/** Effect group of each kind of request. */
export const EFFECT_GROUP = Object.freeze({
  burst: 0,
  reaction: 1,
  text: 2,
  slideKeep: 3,
  section: 4,
  beam: 5,
  charaLocal: 6,
  charaGlobal: 7,
});

/** Order the effect resources update in; draws of one step are made in this order, then by instance. */
export const PLAYER_ORDER: readonly number[] = [
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 45, 60, 2, 3, 4,
  5, 6, 7, 8, 14, 15, 16, 17, 18, 19, 20, 21, 22, 48, 44, 50, 51, 62, 63,
];
