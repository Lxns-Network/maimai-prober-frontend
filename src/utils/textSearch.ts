/** 0 为某字段与查询完全一致，1 为前缀，2 为子串；取各字段中最好的一档，都不匹配时返回 `null`。 */
function matchRank(fields: (string | undefined)[], query: string): number | null {
  let best: number | null = null;
  for (const field of fields) {
    if (!field) continue;
    const lower = field.toLowerCase();
    const rank =
      lower === query ? 0 : lower.startsWith(query) ? 1 : lower.includes(query) ? 2 : null;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/** 忽略大小写匹配各字段，按相关度排序（同档保持原有顺序）并截取前 `limit` 项；空查询返回空数组。 */
export function searchByRelevance<T>(
  items: readonly T[],
  search: string,
  getFields: (item: T) => (string | undefined)[],
  limit: number,
): T[] {
  const query = search.trim().toLowerCase();
  if (!query) return [];
  const matches: { rank: number; item: T }[] = [];
  for (const item of items) {
    const rank = matchRank(getFields(item), query);
    if (rank !== null) matches.push({ rank, item });
  }
  return matches
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((match) => match.item);
}
