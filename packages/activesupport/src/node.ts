/**
 * Side-effect entry point that registers every node-backed adapter.
 *
 * The sync auto-registration each adapter does at module load only works
 * under CommonJS, where `require` is a global; a pure-ESM entry point
 * reaches the sync accessor with an empty registry and throws deep inside
 * unrelated code ("No crypto adapter configured"). Importing this module
 * once at the top of an ESM entry point primes them all through their
 * async getters, so the sync accessors work from then on.
 *
 * `getFsAsync` / `getPathAsync` are the exception since RFC 0135 moved
 * fs-adapter into `@blazetrails/ruby-compat`: a dynamic `import("node:fs")`
 * is a leaf violation there, so the async pair now resolves through the same
 * sync bootstrap `getFs()` uses and priming buys the fs/path seat nothing.
 * They stay in the list so the file keeps registering every adapter, and so
 * an fs backend that fails to resolve fails here rather than deep in a caller.
 *
 * Node-only by construction — nothing in `index.ts` re-exports it, so
 * browser bundles never pull the `node:` imports in.
 *
 * Rails has no counterpart: `require` is uniform there, so there is no
 * split between a sync and an async load path.
 */
import { getChildProcessAsync } from "./child-process-adapter.js";
import { getCryptoAsync } from "./crypto-adapter.js";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { getHttpAsync } from "./http-adapter.js";
import { getOsAsync } from "./os-adapter.js";

await Promise.all([
  getChildProcessAsync(),
  getCryptoAsync(),
  getFsAsync(),
  getPathAsync(),
  getHttpAsync(),
  getOsAsync(),
]);
