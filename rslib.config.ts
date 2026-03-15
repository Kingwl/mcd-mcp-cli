import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: {
    entry: {
      index: "./src/index.ts",
      cli: "./src/cli.ts",
      plugin: "./src/plugin.ts",
    },
  },
  output: {
    target: "node",
    distPath: {
      root: "./dist",
    },
    cleanDistPath: true,
  },
  lib: [
    {
      format: "esm",
      syntax: "es2022",
      bundle: true,
      dts: true,
    },
    {
      format: "cjs",
      syntax: "es2022",
      bundle: true,
      dts: false,
    },
  ],
});
