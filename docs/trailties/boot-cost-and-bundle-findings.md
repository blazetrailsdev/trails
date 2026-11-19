# Boot cost and bundling findings (RFC 0241)

Measured on 2026-11-19 with Node v26.13.0, against the serverless spike
(`examples/serverless-lambda`) built as a Vite SSR bundle (`dist-vite/`),
cold-booted and serving `GET /posts`. Self time is from
`node --cpu-prof --cpu-prof-interval 50`, outside vitest. The host was loaded,
so the before/after rows are interleaved runs of two bundles.

## `boot-define-property-cost-in-mixin-installers`

| Change                                                                      | Before (self)            | After (self)                         | Kept |
| --------------------------------------------------------------------------- | ------------------------ | ------------------------------------ | ---- |
| `ClassAttribute.redefine`: the namespaced reader and writer as one accessor | `redefineMethod` 14.2 ms | `redefine` + `redefineMethod` 2.5 ms | yes  |
| `extendObject`: one `defineProperties` per call instead of per key          | 12.9 ms (mean of 6)      | 14.4 ms (mean of 6)                  | no   |

- `redefine`'s writer half used to re-read the reader's descriptor and redefine
  the same key a second time. One `defineProperty` with both halves removes the
  read and the second transition. It is the shape § "Generated attribute
  readers are properties" already uses: one descriptor carries Ruby's `name`
  and `name=`. Tagged `@perf 11ms`.
- `extendObject` batching gave nothing measurable; the cost is the property
  count on a dictionary-mode constructor, not the call count. Reverted.
- `rbModAppendFeatures` (~30 ms) already batches with one `defineProperties`.
- Temporal polyfill: it cannot be deferred. `@js-temporal/polyfill` is a static
  import of four `date` modules (`index.ts`, `date.ts`, `time.ts`,
  `tzdata-isdst.ts`) whose APIs are synchronous, and ESM has no synchronous
  lazy import. Node 26 ships a native `Temporal`, so the cut is to use it when
  present. Filed as `date-uses-native-temporal-when-present`.

## `rollup-inline-dynamic-imports-boot-order`

With `output.inlineDynamicImports: true`, Rollup orders each inlined
dynamically imported module before the module that imports it, in the order the
`import()` calls appear. So every `registerCompiledFiles` thunk target in
`.trails/boot.generated.js` evaluates before `boot.generated.js` itself, and
before `install.generated.js` has imported `config/application.ts`:

1. `config/routes.ts` runs first and reads `Trails.application` while it is
   still `null`.
2. `config/environment.ts` (`await Trails.initialize()`) runs before
   `registerCompiledFiles`, so initialization cannot find any compiled file.

Reordering the thunk keys does not fix it. `config/environments/*.ts` must run
before `initialize`, but `config/routes.ts` cannot: `RoutesReloader#reload!`
clears the route set before it loads the paths
(`vendor/rails/v8.0.2/railties/lib/rails/application/routes_reloader.rb:23-26`), and a
compiled module is evaluated once, so routes drawn at bundle load are cleared.
Placing routes after `initialize` leaves the reloader's thunk reading the
inlined namespace while the module is suspended in its top-level `await`, a TDZ
`ReferenceError`. Every order is wrong while a config file's body is its side
effect and `initialize` is a top-level `await`, so the fix is a change to what
`trails build` emits, larger than this story. Left open.

## `snapshot-a-bundled-minimal-app-and-measure-cold-start`

No-go. The framework root graph now bundles to CJS except for one top-level
`await`, `libxml2-wasm/lib/libxml2.mjs:3`, which the
`action_view.require_nokogiri` initializer reaches on every boot. And under
`node --build-snapshot`, `WebAssembly` is not defined at all
(`ReferenceError: WebAssembly is not defined`), so a booted app that has
instantiated libxml2 cannot be snapshotted. Blocked on
`nokogiri-extension-loads-on-first-parse-not-at-boot`.

## `vite-ssr-bundle-check-in-ci`

`pnpm check:vite` runs in the Generated App Tests job, gated on activerecord,
trailties or trails-tsc. The spike had stopped building: `serverless/lambda.ts`
imported `packages/website/src/lib/frontiers/rack-bridge.ts`, deleted by
trails#10325, so the bridge now lives in the example.

Re-adding `import "../../connection-adapters.js"` to `connection-handler.ts`
no longer breaks the bundle (checked against a rebuilt `dist`): the cycle it
closed in trails#10324 is gone, so no check can fail on it.
