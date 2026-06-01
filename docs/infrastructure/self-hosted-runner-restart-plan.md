# Self-hosted GitHub Actions runner — restart plan

Status: planning (2026-05-15). Runner app `gh-runner` currently scaled to 0
after the incident at <https://dean.is/blogging-about/hungry-hungry-self-hosted-action-runners>
(~1 TB WAN egress in 36 h, 2,777 jobs).

## Root cause of the previous incident

Two compounding problems on every CI job:

1. `pnpm/action-setup@v4` reinstalls pnpm into the per-job temp dir,
   shadowing the image's preinstalled global pnpm. The store path it
   computes points under the per-job temp dir, **not** the dokku-mounted
   volume at `/home/runner/.local/share/pnpm`. Confirmed: the volume
   contains 0 bytes after thousands of jobs.
2. `actions/setup-node@v4` with `cache: pnpm` saves/restores the pnpm
   store through GitHub's hosted Actions Cache service. That service is
   colocated with hosted runners but **remote** from a home Comcast
   connection. Every cache hit is a ~430 MB tarball over the WAN.

Bug #1 is real but secondary; bug #2 dominates. With ~430 MB × 8 parallel
jobs × hundreds of pushes, ~1 TB / 36 h is consistent with the bill.

## Constraints

- Xfinity residential cap: 1228.8 GiB (1.2 TiB) per calendar month,
  $10 per 50 GB over, two courtesy months / 12. Target ≤ 50% of cap
  from runner traffic.
- A repeat at the prior rate hits the cap in under two days.
- **Must be able to flip between hosted and self-hosted instantly with
  no code change**, so any incident or maintenance window can switch CI
  back to GitHub's infrastructure without a deploy.
- This last constraint rules out runner binary patching (would leave
  self-hosted runners in a half-patched state when reverted) and rules
  out workflow forks (two diverging YAML files rot fast).

## Why not the local cache server (option investigated and rejected)

The natural-sounding "deploy `falcondev-oss/github-actions-cache-server`
and point runners at it" path turns out to require **binary patching of
the .NET runner DLLs** because GitHub now signs cache URLs into the
runner JWT — `ACTIONS_CACHE_URL` env vars are ignored on recent runner
versions (cache-server issues
[#66](https://github.com/falcondev-oss/github-actions-cache-server/issues/66),
[#126](https://github.com/falcondev-oss/github-actions-cache-server/issues/126)).

The patching is a `sed` against UTF-16 byte sequences in two DLLs and
breaks on every runner version bump. It also doesn't compose with the
switch-back requirement: a patched runner image can serve hosted-style
jobs only after rebuild. Rejected.

The local cache server may make sense later as Layer 4 if Layer 1+2+3
don't reach the egress target; revisit at that point.

## Strategy: runner switch + conditional cache strategy

### The switch

Add a repo variable `RUNNER` (Settings → Secrets and variables →
Actions → Variables). Every job sets `runs-on: ${{ vars.RUNNER ||
'ubuntu-latest' }}`. Default unset = hosted. Set it to `self-hosted` to
flip all CI to the home runners in one click. Set it back to empty to
revert.

### The cache strategy

`runner.environment` is `github-hosted` or `self-hosted` at step level.
A composite action at `.github/actions/setup-pnpm/action.yml`
encapsulates the difference:

- On `github-hosted`: `pnpm/action-setup@v4` + `actions/setup-node@v4`
  with `cache: pnpm`. Identical to today.
- On `self-hosted`: skip `action-setup` (use the preinstalled global
  pnpm 10.27.0 from the runner image), set `PNPM_STORE_DIR` explicitly
  to a path inside the mounted volume, run `setup-node` **without**
  `cache: pnpm`. No GitHub-cache-service traffic. pnpm's own store +
  the persistent volume handle reuse across jobs.

5 install-heavy jobs migrate to this composite: build-typecheck, lint,
prettier, guides-typecheck, dx-types. The heavier vitest matrix is a
follow-up (it's wall-clock-dominated, not install-dominated, so the
savings/risk ratio is less compelling).

### Action-version pinning

The composite pins third-party actions by SHA, not tag, so a malicious
or accidental retag in `pnpm/action-setup` or `actions/setup-node`
can't change our CI without a PR. Renovate (or dependabot) can bump
SHAs via PRs; that's the only place SHAs change.

```yaml
- uses: pnpm/action-setup@<40-char-SHA> # v4.0.0
- uses: actions/setup-node@<40-char-SHA> # v4.0.4
```

Resolve current SHAs at composite-creation time with
`gh api repos/<owner>/<repo>/git/ref/tags/<tag> -q .object.sha`.

### Hosted/self-hosted drift guardrail

The composite has two branches; a new step added to one and not the
other is a latent footgun. Mitigation: a smoke job `composite-parity`
that runs the composite on both hosted and self-hosted (when
`vars.RUNNER` is set) and asserts the same `pnpm install --frozen-lockfile`
output hash on a tiny fixture package. Drift between branches produces
different lockfile resolutions → CI fails loud.

### Workflow YAML diff shape

```yaml
jobs:
  build-typecheck:
    runs-on: ${{ vars.RUNNER || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm # composite picks branch
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm typecheck
```

Composite action (`.github/actions/setup-pnpm/action.yml`):

```yaml
name: Setup pnpm
description: Picks hosted vs self-hosted pnpm + cache strategy.
runs:
  using: composite
  steps:
    # Hosted branch — current behavior.
    - if: runner.environment == 'github-hosted'
      uses: pnpm/action-setup@v4
      with: { version: 10.27.0 }
    - if: runner.environment == 'github-hosted'
      uses: actions/setup-node@v4
      with: { node-version: 22, cache: pnpm }

    # Self-hosted branch — preinstalled pnpm, persistent local store,
    # no GitHub Cache service traffic.
    - if: runner.environment != 'github-hosted'
      shell: bash
      run: |
        # Confirm the preinstalled pnpm version matches the lockfile-pinned one.
        # Fail loud if the image drifts from the workflow.
        EXPECTED=10.27.0
        ACTUAL=$(pnpm --version)
        if [ "$ACTUAL" != "$EXPECTED" ]; then
          echo "::error::self-hosted runner has pnpm $ACTUAL; expected $EXPECTED"
          exit 1
        fi
        # Pin store-dir to the persistent volume (mounted via dokku storage).
        pnpm config set store-dir /home/runner/.local/share/pnpm/store
    - if: runner.environment != 'github-hosted'
      uses: actions/setup-node@v4
      with: { node-version: 22 } # no cache: pnpm
```

`actions/setup-node` without `cache:` still downloads the Node tarball
once per job on cache miss; with the runner image preinstalling Node 22
already, it short-circuits to no-op when the runner-tool-cache is
populated. The first job on a fresh runner image fetches ~30 MB; every
subsequent job hits the local tool cache.

### Defense in depth

| Layer                | Mechanism                                                                                                                  | Status                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Bandwidth guard   | `/usr/local/bin/bandwidth-guard` auto-scales `gh-runner=0` on hourly (15 GiB), daily (60 GiB), monthly (700 GiB) WAN trips | Deployed 2026-05-15                                            |
| 2. Bandwidth notify  | `bandwidth-alert` cron emails on hourly/daily/weekly/biweekly/monthly thresholds                                           | Deployed (monthly added 2026-05-15, weekly/biweekly bug fixed) |
| 3. Conditional cache | Composite action above — no GitHub-cache-service WAN traffic on self-hosted                                                | Planned                                                        |
| 4. Scale cap         | `dokku-runner-scale` wrapper refuses `N>4` without `FORCE=1`                                                               | Planned, follow-up                                             |
| 5. Runner image fix  | Verify `pnpm config get store-dir` inside a runner container resolves to the mounted path                                  | Planned (covered by composite's `pnpm config set`)             |

Layers 1+2 are the worst-case containment and are independent of
whether the cache strategy works. Layer 3 is what reduces steady-state
egress. Layer 4 prevents the "agent scaled to 16" footgun.

## Deliverable 1 — composite action and workflow edits

PR scope (in `blazetrailsdev/trails`):

1. Add `.github/actions/setup-pnpm/action.yml` (composite, above).
2. In `.github/workflows/ci.yml`, for each of the 5 install-heavy jobs:
   - Change `runs-on: ubuntu-latest` → `runs-on: ${{ vars.RUNNER ||
'ubuntu-latest' }}`.
   - Replace the 3-step `pnpm/action-setup` + `actions/setup-node` +
     `pnpm install` prefix with `uses: ./.github/actions/setup-pnpm` +
     `pnpm install`.
3. Smoke-test the PR with `vars.RUNNER` unset (hosted path) — should
   look identical to today.
4. Leave `vars.RUNNER` unset on merge. The self-hosted path goes live
   only when we flip the variable.

Diff size budget: well under the 500-LOC ceiling (composite + edits ≈ 60
LOC).

## Deliverable 2 — runner image verification

No image changes planned, but verify the mounted volume actually
receives writes before flipping the switch:

```bash
# In a one-shot runner container (must run as user `runner`):
dokku run gh-runner -- bash -lc '
  pnpm config set store-dir /home/runner/.local/share/pnpm/store
  mkdir -p /home/runner/.local/share/pnpm/store
  echo "PNPM_HOME=$(pnpm config get global-bin-dir 2>/dev/null)"
  echo "store-dir=$(pnpm config get store-dir)"
  touch /home/runner/.local/share/pnpm/store/.canary
  ls -la /home/runner/.local/share/pnpm/store
'
# On host:
ls -la /var/lib/dokku/data/storage/gh-runner-pnpm/store/
# Expect: .canary file visible on host.
```

If the canary file appears on the host, the mount is working and the
composite's `pnpm config set store-dir` will land in a persistent
location. If not, the mount path is wrong — fix the dokku storage mount
before flipping the switch.

## Deliverable 3 — staged switch

Once Deliverable 1 is merged and Deliverable 2's canary check passes:

1. Rotate `GH_PAT` (leaked in transcript on 2026-05-15). Set the new
   token via `sudo dokku config:set gh-runner GH_PAT=<new>` directly,
   not through this conversation.
2. `dokku ps:scale gh-runner runner=1`. Wait for it to register on
   GitHub (Settings → Actions → Runners).
3. **Capture baseline first**: before flipping the switch, record one
   week of hosted-mode WAN attributable to CI pushes (correlate
   `vnstat -i eth0 --json d 8` against GitHub Actions API timestamps).
   This is the comparison number. Without it, "did self-hosted help"
   is unanswerable.
4. In repo, set `vars.RUNNER=self-hosted`. Open a no-op PR (whitespace
   in README) to trigger CI. Watch:
   - Job logs: composite's self-hosted branch fires; no
     `pnpm/action-setup` step; no `cache: pnpm` step.
   - Volume usage: `du -sh /var/lib/dokku/data/storage/gh-runner-pnpm`
     should grow from ~0 to ~430 MB after first install. (The volume
     mounts `~/.local/share/pnpm`, the pnpm config dir; the default
     `store-dir` lives at `~/.local/share/pnpm/store`, **inside** the
     mount. `pnpm config set store-dir` writes to `~/.npmrc`, which is
     **outside** the mount — so the composite runs `pnpm config set`
     every job. Cheap no-op when already set correctly; not skippable.)
   - vnstat: `vnstat -i eth0 --oneline | awk -F\; '{print $11}'`
     before/after. Cold-path numbers are an expectation, not a target —
     record actuals into this doc as a footnote after Deliverable 3.
     Rough expectation: first job ~400–600 MB WAN (cold registry +
     checkout); second job, same lockfile, < 50 MB WAN (incremental
     metadata + checkout).
5. Push the same PR again to validate warm-cache behavior.
6. Only if measurements are clean: raise to 2, then 4. Never above 4
   without a measured month under budget.

Abort signals:

- bandwidth-guard hourly trip → server-side problem, scale to 0 and
  diagnose
- volume usage stays at 0 after install completes → `pnpm config set`
  didn't take, fall back to hosted by unsetting `vars.RUNNER`
- vnstat per-job > 200 MB after warm → something's still pulling from
  GitHub's cache service; check workflow logs for stray `cache: pnpm`

## Deliverable 4 — switch-back drill

Verify the escape hatch before relying on it:

1. With CI running on self-hosted, unset `vars.RUNNER` in repo settings.
2. Push a trivial commit. Confirm CI now runs on `ubuntu-latest` and
   uses the hosted-cache branch.
3. Set `vars.RUNNER=self-hosted` again. Confirm CI flips back.

Time-to-flip: one repo settings change + one push. No deploy, no image
rebuild, no auth dance.

## Deliverable 5 — follow-ups (not blocking)

- `dokku-runner-scale` wrapper: refuses `N>4` without `FORCE=1`.
- Migrate `GH_PAT` to a GitHub App with installation tokens (1-hour
  rotating, no long-lived secret).
- Verdaccio in front of `registry.npmjs.org` as a registry-level cache
  for the cold path. Wire via `npm_config_registry` in
  `dokku config:set gh-runner`. Only worth it if measurements show
  registry pulls still dominate WAN after Deliverable 3.
- Migrate the vitest matrix jobs to the composite. **Unblocking
  trigger**: two consecutive weeks of install-heavy jobs on self-hosted
  with zero bandwidth-guard trips and zero composite-parity failures.
  At that point the vitest jobs become the next-largest WAN line item
  worth optimizing. Without this explicit trigger the deferral rots —
  add a calendar reminder when Deliverable 3 step 5 lands.

## Success criteria

Over a representative 7-day window with `vars.RUNNER=self-hosted`:

- WAN egress attributable to `gh-runner` (vnstat sampled around CI
  pushes) ≤ 20 GiB/day. The cap math: 600 GiB / 30 days ≈ 20 GiB/day
  budget for runner traffic, leaving the other 50% of the Xfinity cap
  for household use.
- bandwidth-guard auto-kill (hourly 15 GiB, daily 60 GiB, monthly
  700 GiB) did not fire.
- Per-job warm-cache WAN ≤ 50 MB, measured on three consecutive runs
  of the same lockfile.
- Switch-back drill (Deliverable 4) passed and re-confirmed once
  during the window.
- No new GH_PAT exposure incidents.

## Open questions

- Whether `actions/setup-node@v4` without `cache:` still mutates
  `PATH`/`npm_config_*` in ways that override our `pnpm config set
store-dir`. Verify in Deliverable 2's canary script before flipping.

## Resolved questions

- **`runner.environment` semantics**: server-populated, not
  runner-populated. The runner reads
  `WellKnownDistributedTaskVariables.RunnerEnvironment` from the job's
  variable dict via `TryGetValue` (`actions/runner` source
  `src/Runner.Worker/JobRunner.cs:168`). Any runner registered via
  `POST /repos/{}/actions/runners/registration-token` (= our entrypoint)
  appears to the orchestrator as `self-hosted`. Dokku is invisible to
  GitHub. The composite uses
  `runner.environment != 'github-hosted'` rather than
  `== 'self-hosted'` so an empty/missing value (server-omission edge
  case) fails open to the self-hosted branch — which surfaces as a
  loud "no cache" CI run rather than a silent fallback to GitHub's
  cache service.
