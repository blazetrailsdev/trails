#!/usr/bin/env node
// Call `main()` explicitly: a self-execution guard inside cli.js compares
// `import.meta.url` against argv[1], which is THIS file, so it would never
// fire and the CLI would be a no-op.
import { main } from "../dist/cli.js";

main();
