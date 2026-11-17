# debian-arm64 self-hosted runners

The two runners `.github/workflows/ci.yml`'s `self_hosted` step routes to
(`debian-arm64`, `debian-arm64-2`): one Debian 13 arm64 VM, 8 cores / 30 GB,
hardware-virtualized, two runner instances under one user. Unlike the
container runner in `../`, these are long-lived hosts, not ephemeral.

## Provision

```bash
sudo infra/runner/debian-arm64/provision.sh root <runner-user>
# as <runner-user>: unpack and register each instance (below), then
infra/runner/debian-arm64/provision.sh runner ~/actions-runner ~/actions-runner-2
```

Both parts are idempotent. Re-run the runner part after bumping an action pin
under `.github/`: it fills `~/actions-archive-cache/<owner>_<repo>/<sha>.tar.gz`
for every pinned action, derived from the `uses:` lines. Without that cache
each job re-downloads every action tarball (~6.7 MB a job, most of a run's
traffic). `provision.sh pinned-actions` lists what it expects.

What each step is for:

- apt `ruby`: `scripts/api-compare/*` tests spawn it. `sqlite3`: `db
schema:dump --format=sql` shells out to the CLI. A netinst image has only a
  cdrom apt source, so the root part adds deb.debian.org.
- Node and pnpm live in `~/.local`, with no root. `setup-pnpm`'s self-hosted
  branch asserts a preinstalled pnpm matching `packageManager`.
- Each instance's `.env` sets `PATH` and the archive cache; the `.path` file
  alone does not reach job steps. The second instance shares the first's
  `RUNNER_TOOL_CACHE`.
- systemd **user** units, kept alive across logout by `loginctl enable-linger`.
- Leave both runners uncapped. The AR SQLite suite takes 261s with 7 workers
  and 385s with `TRAILS_TEST_FORKS=4` on an idle VM; pinned to 4 cores with 3
  workers it takes 430s.

## Register (manual)

Registration takes a short-lived token from Settings → Actions → Runners → New
self-hosted runner, and it is what grants this host code execution, so it
stays a manual step:

```bash
mkdir ~/actions-runner && cd ~/actions-runner
curl -fsSL https://github.com/actions/runner/releases/download/v<ver>/actions-runner-linux-arm64-<ver>.tar.gz | tar xz
./config.sh --url https://github.com/blazetrailsdev/trails --token <token> \
  --name debian-arm64 --labels self-hosted,debian,ARM64 --unattended
```

Repeat in `~/actions-runner-2` with `--name debian-arm64-2`, then run the
runner part of `provision.sh`.

## Pitfall: slow DNS breaks better-sqlite3

A dead first nameserver made every lookup take 10s. `better-sqlite3`'s
`prebuild-install` then timed out and compiled from source, and that source
build aborts on arm64 (`Assertion failed: (env) != nullptr` in
`RemoveEnvironmentCleanupHook`, from `Statement::~Statement`). The root part
warns when a lookup takes over a second; fix `/etc/resolv.conf` first.

### Recovering a poisoned store

pnpm's side-effects cache keeps serving the broken build after DNS is fixed.
Delete its row from the store index, then reinstall:

```bash
store=$(pnpm store path)        # .../store/v11
sqlite3 "$store/index.db" .schema  # find package_index's key column
sqlite3 "$store/index.db" "DELETE FROM package_index WHERE <key> LIKE '%better-sqlite3%';"
pnpm install --frozen-lockfile
```
