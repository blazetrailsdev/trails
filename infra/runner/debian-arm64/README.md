# debian-arm64 self-hosted runners

The `debian-arm64` and `debian-arm64-2` runners that the `changes` job's
`self_hosted` step routes AR SQLite or Unit Tests to (labels `self-hosted`,
`debian`, `ARM64`). One Debian 13 arm64 VM, 8 cores / 30 GB,
hardware-virtualized, two runner instances. Unlike `../Dockerfile` these are
not containers.

## Provisioning

```sh
sudo infra/runner/debian-arm64/provision.sh root claude   # apt, linger, DNS check
# register each instance (below), then as the runner user:
infra/runner/debian-arm64/provision.sh user actions-runner actions-runner-2
```

`provision.sh` is idempotent. The `user` part installs Node and pnpm into
`~/.local` at the versions `.github/actions/setup-pnpm/action.yml` defaults to
(its self-hosted branch asserts a preinstalled pnpm), and writes each
instance's `.env`: `PATH`, `ACTIONS_RUNNER_ACTION_ARCHIVE_CACHE`, and on the
second instance a `RUNNER_TOOL_CACHE` shared with the first. Job steps see only
`.env`, not `.path`. It also installs systemd **user** units
`actions-runner{,-2}.service`, which run thanks to `loginctl enable-linger`.

The action archive cache holds `<owner>_<repo>/<sha>.tar.gz` for every action
`.github/` uses, resolved from its pin. Without it every job re-downloads every
action tarball (~6.7 MB a job, most of a 122 MB run). After bumping a pin, run
`provision.sh actions` to list the misses and `provision.sh user` to fill them.

Both instances stay uncapped. With the VM otherwise idle, the whole AR SQLite
suite takes 261s with 7 workers and 385s with `TRAILS_TEST_FORKS=4`. Pinned to 4
cores with 3 workers it takes 430s.

## Registration (manual)

Registration takes a token from repo Settings → Actions → Runners → New
self-hosted runner, and it is what grants this host code execution on the
repo's workflows, so it stays a deliberate manual step:

```sh
mkdir ~/actions-runner && cd ~/actions-runner
# download + extract the linux-arm64 runner tarball shown on that page, then:
./config.sh --url https://github.com/blazetrailsdev/trails --token <token> \
  --name debian-arm64 --labels debian --unattended
```

Repeat in `~/actions-runner-2` with `--name debian-arm64-2`, then run the
`user` part.

## DNS and better-sqlite3

A dead first nameserver in `/etc/resolv.conf` made every lookup take 10s. With
`better-sqlite3@12`, `prebuild-install` then timed out and compiled the addon
from source, and that build aborts vitest on arm64
(`Assertion failed: (env) != nullptr` in `RemoveEnvironmentCleanupHook`, from
`Statement::~Statement`). `better-sqlite3@13` ships its prebuilds in the
package tarball and has no install script, so it no longer downloads at
install time. Slow DNS still slows every `pnpm install`, so `provision.sh root`
warns when a lookup takes 2s or more.

If a crashing native build ever lands in the store anyway, pnpm's side-effects
cache keeps serving it. Evict it by deleting the package's `package_index` row
from `<store>/v11/index.db` (`sqlite3 index.db "delete from package_index where
key like '%better-sqlite3%'"`), then reinstall.
