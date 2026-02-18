import type { PageContextServer } from 'vike/types'
import fs from 'fs'
import path from 'path'

export async function data(pageContext: PageContextServer) {
  const slug = pageContext.routeParams?.slug || 'index'

  const docsDir = path.join(process.cwd(), 'public', 'docs')

  let markdown = ''
  let filePath = path.join(docsDir, `${slug}.md`)

  if (fs.existsSync(filePath)) {
    markdown = fs.readFileSync(filePath, 'utf-8')
  } else {
    filePath = path.join(docsDir, slug, 'index.md')
    if (fs.existsSync(filePath)) {
      markdown = fs.readFileSync(filePath, 'utf-8')
    }
  }

  let title = 'maimai DX 查分器'
  let description = '一个简单的舞萌 DX & 中二节奏国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。'

  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) {
    title = h1Match[1]
  }

  if (markdown) {
    let d = markdown.split('---')[1] || ''
    d = d.replace(/\[(.*?)\]\(.*?\)/g, '$1')
    d = d.replace(/[>#*`-]/g, '')
    d = d.replace(/\s+/g, ' ').trim()
    d = d.slice(0, 150).trim() + (d.length > 150 ? '...' : '')
    if (d) {
      description = d
    }
  }

  return {
    markdown,
    slug,
    title,
    description,
  }
}
