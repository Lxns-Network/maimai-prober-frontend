import type { PageContext } from 'vike/types'

export function title(pageContext: PageContext) {
  const data = pageContext.data as { title?: string }
  return `${data?.title || '帮助文档'} | maimai DX 查分器`
}
