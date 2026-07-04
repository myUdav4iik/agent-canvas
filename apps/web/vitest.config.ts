import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@agent-company/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@agent-company/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts"),
      "@/": path.resolve(__dirname, "src/"),
    },
  },
});
