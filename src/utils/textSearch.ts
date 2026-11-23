/** NFKC 统一全角与半角；查询与被搜索的文本须经同样处理后再比较。 */
export const normalizeSearchText = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

function matchRank(fields: (string | undefined)[], query: string): number | null {
  let best: number | null = null;
  for (const field of fields) {
    if (!field) continue;
    const text = normalizeSearchText(field);
    const rank = text === query ? 0 : text.startsWith(query) ? 1 : text.includes(query) ? 2 : null;
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/** 字段无需预先归一化；按相关度稳定排序并截取前 `limit` 项，空白查询返回空数组。 */
export function searchByRelevance<T>(
  items: readonly T[],
  search: string,
  getFields: (item: T) => (string | undefined)[],
  limit: number,
): T[] {
  const query = normalizeSearchText(search);
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
