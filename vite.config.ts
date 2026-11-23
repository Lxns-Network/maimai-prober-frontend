import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import * as fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { remark } from "remark";
import remarkSlug from "remark-slug";
import remarkHeadings from "@vcarl/remark-headings";

// A release stamps its tag here so /version.json names the build that is live, the
// way /api/v0/health does for the backend. Local builds keep the timestamp.
const buildVersion = process.env.FRONTEND_VERSION || Date.now().toString();
const displayVersion = process.env.FRONTEND_VERSION || "v0.0.0";

function resolveCommit(): string {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function generateVersionPlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: "generate-version",
    configResolved(config) {
      projectRoot = config.root;
    },
    closeBundle() {
      const outputPath = path.resolve(projectRoot, "dist/client/version.json");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({ version: buildVersion }));
    },
  };
}

const DOCS_SEARCH_INDEX_ID = "virtual:docs-search-index";

/** 与文档页目录取标题的方式相同；`remark-slug` 与页面渲染用的 `rehype-slug` 同为 github-slugger，锚点一致。 */
function getDocHeadings(markdown: string) {
  const file = remark()
    // @ts-expect-error remark-slug uses an older unified plugin type
    .use(remarkSlug)
    .use(remarkHeadings)
    .processSync(markdown);
  return file.data.headings as { depth: number; value: string; data: { id: string } }[];
}

/** 从 `public/docs` 提取每篇文档的一至三级标题供全局搜索；`public` 下的文件不能被源码直接导入。 */
function docsSearchIndexPlugin(): Plugin {
  const resolvedId = `\0${DOCS_SEARCH_INDEX_ID}`;
  let docsDir = "";

  return {
    name: "docs-search-index",
    configResolved(config) {
      docsDir = path.join(config.publicDir, "docs");
    },
    resolveId(id) {
      return id === DOCS_SEARCH_INDEX_ID ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return;
      const slugs = fs
        .readdirSync(docsDir, { recursive: true })
        .map((file) => file.toString().replace(/\\/g, "/"))
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.replace(/\.md$/, ""))
        .sort((a, b) => (a === "index" ? -1 : b === "index" ? 1 : a.localeCompare(b)));

      const docs = slugs.map((slug) => {
        const file = path.join(docsDir, `${slug}.md`);
        this.addWatchFile(file);
        const headings = getDocHeadings(fs.readFileSync(file, "utf-8"))
          .filter((heading) => heading.depth <= 3)
          .map((heading) => ({ id: heading.data.id, text: heading.value, depth: heading.depth }));
        return {
          path: slug === "index" ? "/docs" : `/docs/${slug}`,
          title: headings.find((heading) => heading.depth === 1)?.text ?? slug,
          headings,
        };
      });
      return `export default ${JSON.stringify(docs)};`;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    vike(),
    {
      name: "video-server",
      apply: "serve",
      configureServer(server) {
        const env = loadEnv(server.config.mode, server.config.root, "");
        const dir = env.VITE_VIDEO_DIR || process.env.VITE_VIDEO_DIR;
        if (!dir) {
          return;
        }
        server.middlewares.use("/__video/", (req, res, next) => {
          const name = (req.url ?? "").replace(/^\//, "").split("?")[0];
          if (!/^\d{1,6}\.mp4$/.test(name)) return next();
          const file = path.join(dir, name);
          if (!fs.existsSync(file)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const stat = fs.statSync(file);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader("Accept-Ranges", "bytes");
          const range = req.headers.range;
          if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            const start = m && m[1] ? parseInt(m[1], 10) : 0;
            const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
            res.setHeader("Content-Length", String(end - start + 1));
            fs.createReadStream(file, { start, end }).pipe(res);
          } else {
            res.setHeader("Content-Length", String(stat.size));
            fs.createReadStream(file).pipe(res);
          }
        });
      },
    },
    generateVersionPlugin(),
    docsSearchIndexPlugin(),
    sentryVitePlugin({
      org: "lxns-network",
      project: "maimai-prober-frontend",
      disable: process.env.SENTRY_UPLOAD !== "1" || process.env.VITE_CHART_BENCH === "1",
      sourcemaps: {
        filesToDeleteAfterUpload: "dist/**/*.map",
      },
    }),
  ],
  define: {
    __BUILD_VERSION__: JSON.stringify(displayVersion),
    __BUILD_COMMIT__: JSON.stringify(resolveCommit()),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  assetsInclude: ["**/*.md"],
  optimizeDeps: {
    include: ["react-lazyload", "react-color-extractor"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react";
          }
          if (id.includes("node_modules/@mdi/js")) {
            return "mdi";
          }
          if (id.includes("node_modules/@mantine/core")) {
            return "mantine-core";
          }
        },
      },
    },
    target: ["chrome111", "edge111", "firefox114", "safari15"],
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    sourcemap: true,
    cssCodeSplit: true,
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:7000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  ssr: {
    noExternal: ["beautiful-react-hooks", "react-use"],
  },
});
