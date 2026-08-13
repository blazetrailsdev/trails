#!/usr/bin/env node
// Call `main()` rather than relying on the module's own
// invoked-directly guard: `process.argv[1]` is this wrapper, never
// `dist/tsc-wrapper/cli.js`, so the guard never fires and the CLI
// silently type-checks nothing.
import { main } from "../dist/tsc-wrapper/cli.js";

try {
  main();
} catch (err) {
  process.stderr.write(`trails-tsc: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
