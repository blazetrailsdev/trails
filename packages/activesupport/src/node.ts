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
 * Node-only by construction — nothing in `index.ts` re-exports it, so
 * browser bundles never pull the `node:` imports in.
 *
 * Rails has no counterpart: `require` is uniform there, so there is no
 * split between a sync and an async load path.
 */
import { getChildProcessAsync } from "./child-process-adapter.js";
import { getCryptoAsync } from "./crypto-adapter.js";
import { getFsAsync, getPathAsync } from "./fs-adapter.js";
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
