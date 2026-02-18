import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vike from 'vike/plugin'
import * as fs from "node:fs";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    vike(),
    {
      name: 'generate-version',
      closeBundle() {
        const version = Date.now().toString();
        fs.writeFileSync(path.resolve(__dirname, 'dist/client/version.json'), JSON.stringify({ version }));
      }
    },
    sentryVitePlugin({
      org: "lxns-network",
      project: "maimai-prober-frontend",
      sourcemaps: {
        filesToDeleteAfterUpload: "dist/**/*.map",
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src',
    }
  },
  assetsInclude: ['**/*.md'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react';
          }
          if (id.includes('node_modules/@mdi/js')) {
            return 'mdi';
          }
          if (id.includes('node_modules/@mantine/core')) {
            return 'mantine-core';
          }
        },
      }
    },
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    sourcemap: true,
    cssCodeSplit: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  ssr: {
    noExternal: ['beautiful-react-hooks', 'react-use'],
  }
})