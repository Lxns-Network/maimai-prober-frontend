import type { PageContext } from 'vike/types';

export function description(pageContext: PageContext) {
  const year = pageContext.routeParams?.year || new Date().getFullYear() - 1;
  return `查看你在 ${year} 年的舞萌 DX & 中二节奏游玩数据总结，包括成绩统计、歌曲排行、标签分析等。`;
}
