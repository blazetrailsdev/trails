// Worker bootstrap for the lock_file regression test. A Worker gets none of
// vitest's module pipeline, so it needs tsx's hooks to load the TypeScript
// sources plus the workspace aliasing the sibling hooks module supplies.
import { register } from "node:module";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();
register(new URL("./file-store-lock-worker-hooks.trails.mjs", import.meta.url));
