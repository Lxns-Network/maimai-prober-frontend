import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "maimai-chart-engine",
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
