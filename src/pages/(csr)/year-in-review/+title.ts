import type { PageContext } from 'vike/types';

export function title(pageContext: PageContext) {
  const year = pageContext.routeParams?.year || new Date().getFullYear() - 1;
  return `${year} 年度总结 | maimai DX 查分器`;
}
