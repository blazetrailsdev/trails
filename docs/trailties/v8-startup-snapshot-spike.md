# Spike: a V8 startup snapshot of a booted trails app

Story `spike-v8-startup-snapshot-of-a-booted-app` (RFC 0241). Measured on
2026-11-18 with Node v26.13.0 against a cold `pnpm build` of `main`.

## Verdict: no-go today

A snapshot is not reachable without three prerequisite changes, each larger
than the spike. The boot cost is real, though, and most of it is module
evaluation that a snapshot would remove, so the follow-ups are worth doing in
order.

## What was measured

| Probe                                                        | Result                                       |
| ------------------------------------------------------------ | -------------------------------------------- |
| `import("@blazetrails/trailties")` alone, cold               | 1.65 s wall, 1.90 s user                     |
| `--build-snapshot` on an `.mjs` entry                        | rejected: the builder runs the entry as CJS  |
| `--build-snapshot` entry calling `import()`                  | `Error: Not supported`                       |
| `--build-snapshot` entry `require()`-ing `dist/index.js`     | `Cannot find module`: only built-ins resolve |
| plain `require()` of `trailties/dist/index.js` (require-esm) | `ERR_REQUIRE_ASYNC_MODULE`                   |
| a trivial CJS snapshot, deserialized                         | 0.19 s process start                         |

`--experimental-print-required-tla` names the first top-level `await` reached
from `trailties`' root: `libxml2-wasm/lib/libxml2.mjs:3`, the wasm
instantiation behind the HTML parser. `test-help.ts`, the generated
`config/application.ts` (`autoloadLib`) and `export default await
Trails.initialize()` add more on an app's own path.

So importing the framework, before any application code, already costs most of
the 0.9–1.9 s the serverless spike measured, and a deserialized snapshot starts
an order of magnitude faster.

## What a snapshot-able boot needs

1. **A single synchronous entry.** The snapshot builder evaluates one CJS
   script and resolves only built-in modules, so the app has to be bundled
   (Rollup/esbuild) to one file, and the bundle may not use `import()`.
2. **No top-level `await` in the graph.** require-esm refuses an async graph,
   and a bundler cannot flatten one into a sync script. The wasm loaders
   (`libxml2-wasm`, `wasm-vips`) and trails' own awaited boot steps (root
   CLAUDE.md § "An adapter file is loaded by an awaited step",
   `Trails.initialize`) would move behind an explicit async step that runs
   after deserialize.
3. **Deferred I/O, re-established after deserialize.** Sockets, pools, file
   watchers, timers and wasm memory do not survive serialization. Connection
   pools would be created lazily (as Rails' are) and `v8.startupSnapshot.
addDeserializeCallback` would re-open whatever boot opened.

## Follow-ups

- Make the framework's root import graph free of top-level `await` (move the
  wasm instantiations behind an awaited `load` step).
- Bundle a minimal booted app to one CJS file and measure it under
  `--build-snapshot`, with pools and watchers created after deserialize.
