#!/usr/bin/env node
import { main } from "../dist/tsc-wrapper/cli.js";

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`trails-tsc: ${msg}\n`);
  process.exit(1);
}
