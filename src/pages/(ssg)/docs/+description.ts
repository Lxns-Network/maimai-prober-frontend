import type { PageContext } from 'vike/types'

export function description(pageContext: PageContext) {
  const data = pageContext.data as { description?: string }
  return data?.description
}
