#!/usr/bin/env node
// Call `main()` explicitly: a self-execution guard inside cli.js compares
// `import.meta.url` against argv[1], which is THIS file, so it would never
// fire and the CLI would type-check nothing.
import { main } from "../dist/tsc-wrapper/cli.js";

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`trails-tsc: ${msg}\n`);
  process.exit(1);
}
