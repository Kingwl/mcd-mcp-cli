import { defineConfig } from "@rstest/core";

export default defineConfig({
  testEnvironment: "node",
  include: ["test/**/*.test.ts"],
  exclude: ["dist/**", "node_modules/**"],
});
