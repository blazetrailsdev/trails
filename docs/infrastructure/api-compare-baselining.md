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

Detection is mtime-based on purpose: `git checkout` rewrites the mtime of every
file whose contents it changes and leaves the rest alone, so "some source is
newer than the newest declaration in `dist`" is precisely "this package's build
predates the checked-out sources".

A package with **no** `dist` is not stale — nothing was built, so nothing can be
out of date, and cross-package imports fail to resolve uniformly at every
commit. A worktree that has never run `pnpm build` therefore measures
consistently, which is why the guard is silent in a fresh
`scripts/start-worktree.sh` checkout.

`API_COMPARE_ALLOW_STALE_BUILD=1` skips the guard. Use it only when you are not
producing a baseline.
