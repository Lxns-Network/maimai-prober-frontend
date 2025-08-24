import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as fs from "node:fs";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generate-version',
      closeBundle() {
        const version = Date.now().toString();
        fs.writeFileSync(path.resolve(__dirname, 'dist/version.json'), JSON.stringify({ version }));
      }
    },
    sentryVitePlugin({
      org: "lxns-network",
      project: "maimai-prober-frontend",
      sourcemaps: {
        filesToDeleteAfterUpload: "dist/assets/*.map",
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
        manualChunks: {
          react: ['react', 'react-dom'],
          reactRouter: ['react-router', 'react-router-dom'],
          mdi: ['@mdi/js'],
        },
        entryFileNames: `assets/[hash].js`,
        chunkFileNames: `assets/[hash].js`,
        assetFileNames: `assets/[hash].[ext]`,
      }
    },
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})