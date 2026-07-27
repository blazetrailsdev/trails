# Taking a trustworthy `api:compare` / `api:extra` baseline

Every PR is gated on "the `api:compare` / `test:compare` delta is non-negative",
which means someone has to measure the same numbers twice: once on the branch
and once on the branch's base. This documents the supported way to do that and
the one trap that made the numbers lie.

## The supported procedure

```bash
# 1. branch measurement
pnpm build
pnpm api:compare
pnpm api:extra

# 2. baseline measurement
git checkout --detach origin/main
pnpm build
pnpm api:compare
pnpm api:extra

# 3. back to the branch
git checkout -
pnpm build
```

The `pnpm build` after **every** checkout is the part that is easy to skip and
must not be. It is cheap in the common case (`tsc --build` is incremental) and
it is what makes the two measurements comparable.

## Why the rebuild is mandatory

The TS extractor compiles each package with the real module resolver. An
`import { … } from "@blazetrails/activesupport"` in `packages/trailties`
resolves through pnpm's `node_modules` symlink into
`packages/activesupport/dist/*.d.ts` — so the extracted surface of `trailties`
depends on the **build output** of `activesupport`, not on its sources.

`dist/` is untracked build output. `git checkout` does not update it. So a
baseline taken by checking out `origin/main` without rebuilding measures
`origin/main`'s sources against the **branch's** `dist`, and packages the diff
never touched can move. That is a phantom delta, and it cuts both ways: it can
force an agent to argue that a delta it just measured is not real, or it can
mask a real regression.

This is measurable at a single commit. With no package built, `api:extra`
reports `trailties 147` and `actionview 90`; after `pnpm build`, the same commit
reports `trailties 149` and `actionview 92` — the extra two in each are the
surface that only resolves once the sibling's declarations exist. Those are the
exact totals that were originally mistaken for a `origin/main`-vs-branch delta.

None of this is a cache bug. The shared cache is content-keyed and each entry
records the resolved read-set of the extraction that produced it, so the caches
correctly serve exactly what a fresh extraction would produce — a fresh
extraction of a mismatched tree. `API_COMPARE_FORCE=1` does not help either;
verified back-to-back, a forced run and a cached run at the same commit are
byte-identical.

## The guard

`scripts/api-compare/build-freshness.ts` runs before any extraction. If a
package has a `dist` whose newest `.d.ts` is older than the newest file in its
`src`, `pnpm api:compare` fails with the list of stale packages instead of
emitting numbers that cannot be compared to anything.

The guard does not compare timestamps. It asks `tsc` itself, via
`ts.createSolutionBuilder(...).getUpToDateStatusOfProject()` — the same
up-to-date computation `tsc --build` uses to decide what to emit. By
construction the guard can never contradict a `pnpm build` that just succeeded,
and it reports `OutOfDateWithSelf` as soon as a checkout rewrites a source and
`OutOfDateRoots` when one only deletes a file.

An mtime comparison ("is some source newer than the newest `.d.ts`?") looks
equivalent and is not. `.github/actions/cache-build` restores `dist` plus
`tsconfig.tsbuildinfo` from a tarball keyed on a content hash of every package
`src/`, so the restored outputs carry their **archive** mtimes while
`actions/checkout` has just written every source at "now". `pnpm build`
correctly no-ops, leaving a tree that is perfectly current but looks, by mtime,
like every package is stale. The first version of this guard did compare mtimes
and failed all 13 packages on every CI run while contradicting the build that
had just succeeded.

The build guard follows each package's transitive `references`, so a workspace
that is NOT api-compared but whose declarations an api-compared package imports
— `actionview` references `@blazetrails/tse-compiler` — is checked too. tsc
reports the IMPORTER as `UpToDateWithUpstreamTypes` when such a reference goes
stale, which is not an out-of-date status, so the referenced project has to be
asked about directly. This is reachability, not "every workspace": something
nothing references is still never consulted.

Both guards are scoped to the packages `api:compare` actually extracts
(`apiComparePackageRoots()` in `scripts/api-compare/config.ts`, derived from
`vendor/sources.ts`) — down to the `src` subdir for the four packages that share
`packages/actionpack`. A workspace that is not api-compared (`activerecord-cli`,
`trails-tsc`, `tse-compiler`, `website`, …) cannot affect the TS manifest, so a
stale build there never blocks a run.

A package with **no** `dist` is not stale — nothing was built, so nothing can be
out of date, and cross-package imports fail to resolve uniformly at every
commit. A worktree that has never run `pnpm build` therefore measures
consistently, which is why the guard is silent in a fresh
`scripts/start-worktree.sh` checkout.

A second guard covers the downstream half: `pnpm api:extra` reads the manifests
`pnpm api:compare` left behind rather than re-extracting, so running it alone
after a checkout would report the previous commit's totals. It now fails if
`output/ts-api.json` predates `packages/*/src`.

`API_COMPARE_ALLOW_STALE_BUILD=1` skips both guards. Use it only when you are
not producing a baseline.
