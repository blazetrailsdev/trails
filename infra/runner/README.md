# GitHub Actions self-hosted runner — Dokku deployment

Ephemeral runner image. Each container picks up one CI job, then exits.
Dokku restarts it. Scale with `dokku ps:scale gh-runner runner=N`.

Used by `.github/workflows/ci.yml` for the trust-gated pure-Node job set
(`build-and-typecheck`, `lint`, `prettier`, `guides-typecheck`,
`dx-type-tests`, `virtualized-dx-type-tests`, `unit-tests`, `website`).

Adapter tests, parity jobs, and `rails-comparison` stay on `ubuntu-latest`
because this image deliberately does **not** include Docker — keeping the
attack surface and image size small.

## Prerequisites

- A GitHub PAT for the runner to mint registration tokens.
  - **Recommended:** fine-grained PAT scoped to this single repo with
    `Administration: read and write`. Strictly narrower than a classic PAT.
  - Alternative: classic PAT with `repo` scope.
- Runner v2.283+ (image pins v2.334.0). `--ephemeral` is undefined on
  older runners.

## One-time Dokku setup

All commands run as the user that owns the Dokku install.

```bash
# 1. Create the app and tell Dokku to use the Dockerfile builder.
dokku apps:create gh-runner
dokku builder:set gh-runner selected dockerfile

# 2. The Dockerfile lives at infra/runner/Dockerfile in the repo root,
#    so point Dokku at that subdirectory.
dokku builder-dockerfile:set gh-runner dockerfile-path infra/runner/Dockerfile

# 3. Wire credentials.
dokku config:set --no-restart gh-runner \
  GH_REPO=blazetrailsdev/trails \
  GH_PAT=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  RUNNER_LABELS=self-hosted,Linux,X64

# 4. Restart policy MUST be `always`, not Dokku's default `on-failure:10`.
#    Ephemeral runners exit with code 0 after each job (success); the
#    on-failure default treats that as "no restart needed" and the pool
#    drains to zero after one CI run.
dokku ps:set gh-runner restart-policy always

# 5. Persistent pnpm store across ephemeral container lifetimes. CAS-safe
#    for concurrent replicas (pnpm uses content-addressed storage).
#    node_modules and dist remain per-container, never shared.
sudo mkdir -p /var/lib/dokku/data/storage/gh-runner-pnpm
sudo chown 1000:1000 /var/lib/dokku/data/storage/gh-runner-pnpm
dokku storage:mount gh-runner /var/lib/dokku/data/storage/gh-runner-pnpm:/home/runner/.local/share/pnpm
```

## Deploy

The simplest path is to push this repo to Dokku as a remote. From a clone
of `blazetrailsdev/trails`:

```bash
git remote add dokku dokku@DOKKU_HOST:gh-runner   # or dokku@localhost
git push dokku main
```

Dokku builds with the Dockerfile path configured in step 2 above.

## Scale

```bash
dokku ps:scale gh-runner runner=4
```

`runner` is the proc type matching the Dockerfile's `ENTRYPOINT`. Each
replica is one ephemeral runner; restart-on-exit is Dokku's default.

## Verify

```bash
gh api repos/blazetrailsdev/trails/actions/runners \
  --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

Expect N online runners with names like `gh-runner-runner-1-<timestamp>`.
Each runner's record disappears after it runs a job; a fresh entry
replaces it on the next container start.

## Operations

**Logs:**

```bash
dokku logs gh-runner --tail 100
```

**Crash-looping?** Most likely a bad `GH_PAT` (401 from token endpoint) or
a revoked PAT. Check the entrypoint log line `→ Requesting registration
token` followed by the response.

**Updating the runner version:** bump `RUNNER_VERSION` in the Dockerfile
and `git push dokku main`. Check
[releases](https://github.com/actions/runner/releases) quarterly — GitHub
deprecates old versions on a rolling schedule.

**Tearing down old non-Dokku runners** (after Dokku replicas are healthy):

```bash
gh api repos/blazetrailsdev/trails/actions/runners \
  --jq '.runners[] | select(.name | test("^duodeca")) | .id' \
  | xargs -I{} gh api -X DELETE repos/blazetrailsdev/trails/actions/runners/{}
```
