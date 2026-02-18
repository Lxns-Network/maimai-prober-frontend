import fs from 'fs';
import path from 'path';

function getMarkdownFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath, baseDir));
    } else if (item.endsWith('.md')) {
      const relativePath = path.relative(baseDir, fullPath);
      const urlPath = relativePath
        .replace(/\\/g, '/')
        .replace(/\.md$/, '');
      
      files.push(urlPath === 'index' ? '/docs' : `/docs/${urlPath}`);
    }
  }

  return files;
}

export function onBeforePrerenderStart() {
  const docsDir = path.join(process.cwd(), 'public', 'docs');
  const paths = getMarkdownFiles(docsDir);
  
  const sortedPaths = paths.sort((a, b) => {
    if (a === '/docs') return -1;
    if (b === '/docs') return 1;
    return a.localeCompare(b);
  });

  return sortedPaths;
}
