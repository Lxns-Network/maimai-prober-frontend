import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import * as fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
    sentryVitePlugin({
      org: "lxns-network",
      project: "maimai-prober-frontend",
      disable: process.env.VITE_CHART_BENCH === "1",
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
    host: "0.0.0.0",
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
