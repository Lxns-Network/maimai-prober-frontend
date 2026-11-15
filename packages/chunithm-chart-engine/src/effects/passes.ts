const TYPE_PASSES = [8, 12, 16];

function select(flags: number, userId: number, key: number): number {
  let type = flags & 0x20 ? 2 : flags & 0x40 ? 1 : 0;
  if (flags & 0x80) type = 3;
  if (flags & 0x2000) type = 4;
  if (userId === 0) {
    if (type < 3) return TYPE_PASSES[type];
    if (type === 3) return key < 0x8000 ? 4 : 24;
  }
  throw new RangeError(`No draw pass for flags ${flags} and user ${userId}`);
}

/** The pass index a primitive draw lands in, from its feature words and order key. */
export function primitivePass(featureWord96: number, featureWord100: number, key: number): number {
  return select(featureWord96 >>> 0, (featureWord100 >>> 25) & 15, key);
}

/** The pass index a particle draw lands in, from its feature word and order key. */
export function particlePass(featureWord144: number, key: number): number {
  return select(featureWord144 >>> 0, 0, key);
}
