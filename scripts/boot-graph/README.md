# boot-graph

RFC 0192's harness: how many modules Node resolves when an entry is imported,
bucketed by owning package, against each workspace package's shipped
`dist/**/*.js` count. Needs a built tree (`pnpm build`) and Node 24+.

```sh
pnpm tsx scripts/boot-graph/measure.mts                      # app boot; diff against baseline.json
pnpm tsx scripts/boot-graph/measure.mts --write              # rewrite baseline.json and scc-map.json
pnpm tsx scripts/boot-graph/measure.mts --entry @blazetrails/ruby-compat --runs 5
```

- `register.mjs` is loaded with `node --import`, in its own module, so the
  resolve hook is live before `probe.mjs` imports the entry, and the URL set is
  written from an `exit` handler.
- Timing is the median of `--runs` warm runs (default 3), after one discarded
  cold run. Each run is a fresh process.
- The app entry is `examples/serverless-lambda/config/environment.ts`.
- `baseline.json` holds the app's per-package loaded counts, plus
  `rubyCompatTarget`: the ruby-compat modules loaded by importing only the
  owning modules of every barrel binding the app's loaded packages import
  (the union a Phase 2 migration ends at, with every file that imports the whole
  barrel by namespace or side effect listed in `wholeBarrelImports` and counted
  only in `rubyCompatTargetWithWholeBarrelImports`), and `appTarget`, the app total with
  ruby-compat at that target.
- `scc-map.json` maps every value export of the ruby-compat barrel to its owning
  `dist` module and the index of its strongly-connected component in `sccs`
  (`null` when outside every cycle). Phase 2 codemods read it to pick subpaths.

CI (`Build & Type Check`) prints the table and fails when ruby-compat's
loaded count exceeds `baseline.json` or `scc-map.json` is stale; every other package is report-only. When a
migration lowers the count, rerun with `--write` and commit the new baseline.
