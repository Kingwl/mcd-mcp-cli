#!/usr/bin/env node

import "dotenv/config";

let runCli;

try {
  ({ runCli } = await import("../dist/cli.js"));
} catch (error) {
  console.error(
    "Built CLI was not found. Run `npm run build` before invoking `mcd`.",
  );
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
  process.exit();
}

const exitCode = await runCli({
  argv: process.argv.slice(2),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  fetchImpl: globalThis.fetch,
});

if (typeof exitCode === "number") {
  process.exitCode = exitCode;
}
