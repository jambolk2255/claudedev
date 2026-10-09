import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Only pure-TypeScript modules are tested here (no React Native imports).
  test: { include: ["src/core/**/*.test.ts", "src/ai/**/*.test.ts"], environment: "node" },
});
