import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const r = (p: string) => resolve(process.cwd(), p);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@as-one\/core\/src\/(.+)\.js$/, replacement: r("core/$1.ts") },
      { find: /^@as-one\/panel\/src\/(.+)\.js$/, replacement: r("panel/$1.ts") },
      { find: /^@as-one\/panel-ui\/src\/(.+)\.js$/, replacement: r("panel-ui/$1.ts") },
      { find: /^@as-one\/core$/, replacement: r("core/index.ts") },
      { find: /^@as-one\/panel$/, replacement: r("panel/index.ts") },
      { find: /^@as-one\/panel-ui$/, replacement: r("panel-ui/index.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "core/**/*.test.ts", "panel/**/*.test.ts", "test/**/*.test.ts"],
  },
});
