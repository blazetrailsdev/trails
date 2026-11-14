import { defineConfig } from "vitest/config";
import path from "path";
import os from "os";
import { resolveForkCount } from "./packages/activerecord/test/support/ar-db-forks-default.js";

// AR_DB_FORKS (read in test-setup-worker-db.ts) requests a vitest worker
// count; TEST_FORKS below is the effective one — the request clamped to the
// host ceiling, the same clamp ar-db-slots.ts applies via the OS adapter. The
// advisory-lock slot pool is sized SEPARATELY, with headroom over that
// effective count — see support/ar-db-slots.ts (slots = workers +
// headroom, or an explicit AR_DB_SLOTS override). TRAILS_TEST_FORKS
// caps the vitest worker count so that concurrent local worktrees don't
// saturate the machine. Precedence: TRAILS_TEST_FORKS > AR_DB_FORKS >
// DEFAULT_FORKS, all capped by the host ceiling. Raise with TRAILS_TEST_FORKS=N
// for a solo full run; the live AR DB jobs (postgres-tests, mysql-tests,
// maria-tests) set neither, so both the worker count and the slot pool follow
// the runner's vCPU count with no workflow edit when that shape changes.
//
// Historical note: those jobs used to set AR_DB_FORKS=8, but the per-project
// `maxForks` was a vitest-3 no-op, so every CI run actually ran at vitest's
// own `numCpus - 1` fallback. The 8 only inflated the advisory-slot pool
// (ar-db-slots.ts sizes it from AR_DB_FORKS + 2) with slot DBs no worker could
// ever claim. The tune-ar-db-forks-to-runner-cores sweep (RFC 0028) that found
// forks=8 and forks=4 wall-clock-indistinguishable was comparing the clamped
// fallback against itself, so it says nothing about 8 forks either way.
//
// forks=2 used to fail deterministically in that sweep (acquireAdvisorySlotPg
// threw "all 2 advisory lock slots are held" after its bounded 5s retry) — not
// a deadlock, and NOT "pool == worker count" per se (forks=8 was also pool ==
// workers and fine). The cause was the lack of headroom: each worker holds its
// slot for its whole process lifetime and frees it only on exit (see
// test-setup-worker-db.ts), so while the fork pool recycles a worker between
// files a replacement worker can start and try to claim a slot before the
// outgoing process has exited and released its lock. Decoupling the slot pool
// from the worker count (ar-db-slots.ts) gives every fork count that headroom,
// so sub-8 fork counts are now viable too.

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  // The website is deliberately out of CI, tests included. Its suite needs a
  // `svelte-kit sync` and a browser-shaped environment, and the site being
  // stale between manual runs is acceptable — the `Website` build job in
  // ci.yml is disabled for the same reason. Run it by hand from
  // packages/website: `pnpm exec svelte-kit sync && pnpm exec vitest run`.
  "packages/website/**",
  "packages/*/dx-tests/**",
  // System tests launch real browsers; only the `system` project runs them.
  "**/*.system.test.ts",
];

const SYSTEM_SCREENSHOT_DIRECTORY = "tmp/screenshots";

// Rails model: ARCONN selects one backend; that backend's adapter dirs
// run as part of the shared `pnpm vitest run packages/activerecord/` invocation;
// the other backends' adapter dirs are excluded (mirrors `rake test:postgresql`
// / `rake test:mysql2` / `rake test:sqlite3`).
//
// The pure-unit `connection-adapters/<db>/**` subdirs (OID types, quoting
// helpers, schema-creation stubs) are NOT in this exclude — they run on every
// CI job regardless of ARCONN. Live-DB cases inside them are wrapped in
// `describeIfPg` / `describeIfMysqlAdapter` / `describeIfSqlite`.
//
// CI sets ARCONN=postgresql on postgres-tests and ARCONN=mysql2 on
// mysql-tests. sqlite-tests leaves ARCONN unset (defaults to sqlite3).
const ARCONN = process.env.ARCONN ?? "sqlite3";

const PG_ADAPTER_DIRS = [
  "packages/activerecord/test/cases/adapters/postgresql/**",
  "packages/activerecord/test/cases/tasks/postgresql-*.test.ts",
];
const MYSQL_ADAPTER_DIRS = [
  "packages/activerecord/test/cases/adapters/abstract-mysql-adapter/**",
  "packages/activerecord/test/cases/adapters/mysql2/**",
  "packages/activerecord/test/cases/connection-adapters/mysql2-*.test.ts",
  "packages/activerecord/test/cases/tasks/mysql-*.test.ts",
];
const SQLITE_ADAPTER_DIRS = [
  "packages/activerecord/test/cases/adapters/sqlite3/**",
  "packages/activerecord/test/cases/tasks/sqlite-*.test.ts",
];

const ADAPTER_SPECIFIC_EXCLUDE =
  ARCONN === "postgresql"
    ? [...MYSQL_ADAPTER_DIRS, ...SQLITE_ADAPTER_DIRS]
    : ARCONN === "mysql2"
      ? [...PG_ADAPTER_DIRS, ...SQLITE_ADAPTER_DIRS]
      : [...PG_ADAPTER_DIRS, ...MYSQL_ADAPTER_DIRS]; // default: sqlite3

// Low-level SQLite driver wrappers + the adapter driver-binding tests. These
// are pure unit tests that construct adapters/drivers directly and must NOT
// load cases/helper.ts, whose connection bootstrap opens a DB at module load.
// Run them in their own setup-free project.
const SQLITE_DRIVER_TESTS = [
  "packages/activerecord/test/cases/sqlite/**/*.test.ts",
  "packages/activerecord/test/cases/sqlite-adapter.trails.test.ts",
];

// Clamp to vitest's own host-derived ceiling (numCpus - 1): while the root
// maxForks cap was a per-project no-op, that ceiling is what every run
// actually used, and the suite's timeouts are tuned to it — on the 4-vCPU CI
// runner, honoring a fork count above it (AR_DB_FORKS=8, as CI used to set)
// oversubscribes PG enough to push the full-DB schema-dump tests past their
// 5s timeout. The env vars can only lower the cap, never raise it past the
// host. The precedence + clamp itself is shared with ar-db-slots.ts's
// workerForkCount() via the dependency-free ar-db-forks-default.ts (the config
// is loaded before any workspace package is built, so it cannot import the
// activesupport-backed module directly); only the host-core reading differs.
const _hostForkCap = Math.max(os.availableParallelism() - 1, 1);
const TEST_FORKS = resolveForkCount(process.env, _hostForkCap);

const alias = {
  "@blazetrails/activemodel/testing/lint": path.resolve(
    __dirname,
    "packages/activemodel/lib/lint.ts",
  ),
  "@blazetrails/activemodel/locale/en": path.resolve(
    __dirname,
    "packages/activemodel/lib/locale/en.ts",
  ),
  "@blazetrails/activesupport/core-ext/numeric/bytes": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/numeric/bytes.ts",
  ),
  "@blazetrails/activesupport/message-verifier": path.resolve(
    __dirname,
    "packages/activesupport/lib/message-verifier.ts",
  ),
  "@blazetrails/activesupport/messages/codec": path.resolve(
    __dirname,
    "packages/activesupport/lib/messages/codec.ts",
  ),
  "@blazetrails/activesupport/messages/rotation-configuration": path.resolve(
    __dirname,
    "packages/activesupport/lib/messages/rotation-configuration.ts",
  ),
  "@blazetrails/activesupport/messages/serializer-with-fallback": path.resolve(
    __dirname,
    "packages/activesupport/lib/messages/serializer-with-fallback.ts",
  ),
  "@blazetrails/activesupport/message-encryptor": path.resolve(
    __dirname,
    "packages/activesupport/lib/message-encryptor.ts",
  ),
  "@blazetrails/activesupport/core-ext/kernel/reporting": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/kernel/reporting.ts",
  ),
  "@blazetrails/activesupport/core-ext/date/calculations": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/date/calculations.ts",
  ),
  "@blazetrails/activesupport/core-ext/date/conversions": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/date/conversions.ts",
  ),
  "@blazetrails/activesupport/core-ext/string/inflections": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/string/inflections.ts",
  ),
  "@blazetrails/activesupport/core-ext/date-time/calculations": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/date-time/calculations.ts",
  ),
  "@blazetrails/activesupport/core-ext/date-time/conversions": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/date-time/conversions.ts",
  ),
  "@blazetrails/activesupport/core-ext/date-and-time/zones": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/date-and-time/zones.ts",
  ),
  "@blazetrails/activesupport/core-ext/hash/slice": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/hash/slice.ts",
  ),
  "@blazetrails/activesupport/core-ext/string/inflections": path.resolve(
    __dirname,
    "packages/activesupport/lib/core-ext/string/inflections.ts",
  ),
  "@blazetrails/activesupport/temporal": path.resolve(
    __dirname,
    "packages/activesupport/lib/temporal.ts",
  ),
  "@blazetrails/activesupport/key-generator": path.resolve(
    __dirname,
    "packages/activesupport/lib/key-generator.ts",
  ),
  "@blazetrails/activesupport/digest": path.resolve(
    __dirname,
    "packages/activesupport/lib/digest.ts",
  ),
  // Above the bare entry: Vite's object alias is a prefix match, so "…/cache"
  // alone would also swallow "…/cache/*".
  "@blazetrails/activesupport/cache/":
    path.resolve(__dirname, "packages/activesupport/lib/cache/") + "/",
  "@blazetrails/activesupport/cache": path.resolve(
    __dirname,
    "packages/activesupport/lib/cache.ts",
  ),
  "@blazetrails/activesupport/configuration-file": path.resolve(
    __dirname,
    "packages/activesupport/lib/configuration-file.ts",
  ),
  "@blazetrails/activesupport/glob": path.resolve(__dirname, "packages/activesupport/lib/glob.ts"),
  "@blazetrails/activesupport/message-pack": path.resolve(
    __dirname,
    "packages/activesupport/lib/message-pack.ts",
  ),
  "@blazetrails/activesupport/test-case": path.resolve(
    __dirname,
    "packages/activesupport/lib/test-case.ts",
  ),
  "@blazetrails/activesupport/log-subscriber/test-helper": path.resolve(
    __dirname,
    "packages/activesupport/lib/log-subscriber/test-helper.ts",
  ),
  "@blazetrails/activesupport/testing/autorun": path.resolve(
    __dirname,
    "packages/activesupport/lib/testing/autorun.ts",
  ),
  "@blazetrails/activesupport/gzip": path.resolve(__dirname, "packages/activesupport/lib/gzip.ts"),
  "@blazetrails/activesupport/encrypted-file": path.resolve(
    __dirname,
    "packages/activesupport/lib/encrypted-file.ts",
  ),
  "@blazetrails/activesupport/testing/temporal-helpers": path.resolve(
    __dirname,
    "packages/activesupport/lib/testing/temporal-helpers.ts",
  ),
  "@blazetrails/activesupport/test/cache/behaviors/":
    path.resolve(__dirname, "packages/activesupport/test/cache/behaviors") + "/",
  "@blazetrails/activesupport": path.resolve(__dirname, "packages/activesupport/lib/index.ts"),
  "@blazetrails/arel/test": path.resolve(__dirname, "packages/arel/test"),
  "@blazetrails/arel": path.resolve(__dirname, "packages/arel/lib/index.ts"),
  "@blazetrails/activemodel": path.resolve(__dirname, "packages/activemodel/lib/index.ts"),
  "@blazetrails/activerecord/destroy-association-async-job": path.resolve(
    __dirname,
    "packages/activerecord/lib/destroy-association-async-job.ts",
  ),
  "@blazetrails/activerecord/message-pack": path.resolve(
    __dirname,
    "packages/activerecord/lib/message-pack.ts",
  ),
  "@blazetrails/activerecord/fixtures.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/fixtures.ts",
  ),
  "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/connection-adapters/sqlite3-adapter.ts",
  ),
  "@blazetrails/activerecord/connection-adapters/better-sqlite3-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/connection-adapters/better-sqlite3-adapter.ts",
  ),
  "@blazetrails/activerecord/connection-adapters/node-sqlite-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/connection-adapters/node-sqlite-adapter.ts",
  ),
  "@blazetrails/activerecord/connection-adapters/expo-sqlite-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/connection-adapters/expo-sqlite-adapter.ts",
  ),
  "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/connection-adapters/postgresql-adapter.ts",
  ),
  "@blazetrails/activerecord/adapters/postgresql-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/adapters/postgresql-adapter.ts",
  ),
  "@blazetrails/activerecord/adapters/mysql2-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/lib/adapters/mysql2-adapter.ts",
  ),
  "@blazetrails/activerecord/fixtures": path.resolve(
    __dirname,
    "packages/activerecord/lib/fixtures.ts",
  ),
  "@blazetrails/activerecord/active-record": path.resolve(
    __dirname,
    "packages/activerecord/lib/active-record.ts",
  ),
  "@blazetrails/activerecord/test-databases": path.resolve(
    __dirname,
    "packages/activerecord/lib/test-databases.ts",
  ),
  "@blazetrails/activerecord/test-fixtures": path.resolve(
    __dirname,
    "packages/activerecord/lib/test-fixtures.ts",
  ),
  "@blazetrails/activerecord/testing/query-assertions": path.resolve(
    __dirname,
    "packages/activerecord/lib/testing/query-assertions.ts",
  ),
  "@blazetrails/activerecord/coders/json": path.resolve(
    __dirname,
    "packages/activerecord/lib/coders/json.ts",
  ),
  "@blazetrails/activerecord/migration": path.resolve(
    __dirname,
    "packages/activerecord/lib/migration.ts",
  ),
  "@blazetrails/activerecord/sqlite-adapter": path.resolve(
    __dirname,
    "packages/activerecord/lib/sqlite-adapter.ts",
  ),
  "@blazetrails/activerecord/sqlite/better-sqlite3": path.resolve(
    __dirname,
    "packages/activerecord/lib/sqlite/better-sqlite3.ts",
  ),
  "@blazetrails/activerecord/sqlite/node-sqlite": path.resolve(
    __dirname,
    "packages/activerecord/lib/sqlite/node-sqlite.ts",
  ),
  "@blazetrails/activerecord/sqlite/expo-sqlite": path.resolve(
    __dirname,
    "packages/activerecord/lib/sqlite/expo-sqlite.ts",
  ),
  "@blazetrails/activerecord/encryption/message-pack-message-serializer": path.resolve(
    __dirname,
    "packages/activerecord/lib/encryption/message-pack-message-serializer.ts",
  ),
  "@blazetrails/activerecord/encryption": path.resolve(
    __dirname,
    "packages/activerecord/lib/encryption/index.ts",
  ),
  "@blazetrails/activerecord-cli": path.resolve(
    __dirname,
    "packages/activerecord-cli/lib/index.ts",
  ),
  "@blazetrails/activerecord": path.resolve(__dirname, "packages/activerecord/lib/index.ts"),
  "@blazetrails/rack-proxy/": path.resolve(__dirname, "packages/rack-proxy/lib") + "/",
  "@blazetrails/rack-proxy": path.resolve(__dirname, "packages/rack-proxy/lib/index.ts"),
  "@blazetrails/rack-session/": path.resolve(__dirname, "packages/rack-session/lib") + "/",
  "@blazetrails/rack-session": path.resolve(__dirname, "packages/rack-session/lib/index.ts"),
  "@blazetrails/rack-test/": path.resolve(__dirname, "packages/rack-test/lib") + "/",
  "@blazetrails/rack-test": path.resolve(__dirname, "packages/rack-test/lib/index.ts"),
  "@blazetrails/rackup/": path.resolve(__dirname, "packages/rackup/lib") + "/",
  "@blazetrails/rackup": path.resolve(__dirname, "packages/rackup/lib/index.ts"),
  "@blazetrails/rack": path.resolve(__dirname, "packages/rack/lib/index.ts"),
  "@blazetrails/actionview/": path.resolve(__dirname, "packages/actionview/lib") + "/",
  "@blazetrails/actionview": path.resolve(__dirname, "packages/actionview/lib/index.ts"),
  "@blazetrails/tse-compiler": path.resolve(__dirname, "packages/tse-compiler/lib/index.ts"),
  "@blazetrails/actionpack/system-testing": path.resolve(
    __dirname,
    "packages/actionpack/lib/system-testing.ts",
  ),
  "@blazetrails/actionpack/testing": path.resolve(__dirname, "packages/actionpack/lib/testing.ts"),
  "@blazetrails/actionpack": path.resolve(__dirname, "packages/actionpack/lib/index.ts"),
  "@blazetrails/globalid/wire": path.resolve(__dirname, "packages/globalid/lib/wire.ts"),
  "@blazetrails/globalid/signed-global-id": path.resolve(
    __dirname,
    "packages/globalid/lib/signed-global-id.ts",
  ),
  "@blazetrails/globalid": path.resolve(__dirname, "packages/globalid/lib/index.ts"),
  "@blazetrails/activejob/": path.resolve(__dirname, "packages/activejob/lib") + "/",
  "@blazetrails/activejob": path.resolve(__dirname, "packages/activejob/lib/index.ts"),
  "@blazetrails/actionmailer/": path.resolve(__dirname, "packages/actionmailer/lib") + "/",
  "@blazetrails/actionmailer": path.resolve(__dirname, "packages/actionmailer/lib/index.ts"),
  "@blazetrails/actioncable/test/support/":
    path.resolve(__dirname, "packages/actioncable/test/support") + "/",
  "@blazetrails/actioncable/": path.resolve(__dirname, "packages/actioncable/lib") + "/",
  "@blazetrails/actioncable": path.resolve(__dirname, "packages/actioncable/lib/index.ts"),
  "@blazetrails/solid-cable/": path.resolve(__dirname, "packages/solid-cable/lib") + "/",
  "@blazetrails/solid-cable": path.resolve(__dirname, "packages/solid-cable/lib/index.ts"),
  "@blazetrails/solid-cache/": path.resolve(__dirname, "packages/solid-cache/lib") + "/",
  "@blazetrails/solid-cache": path.resolve(__dirname, "packages/solid-cache/lib/index.ts"),
  "@blazetrails/activestorage/test-helpers/":
    path.resolve(__dirname, "packages/activestorage/test/support") + "/",
  "@blazetrails/activestorage/": path.resolve(__dirname, "packages/activestorage/lib") + "/",
  "@blazetrails/activestorage": path.resolve(__dirname, "packages/activestorage/lib/index.ts"),
  "@blazetrails/actionmailbox/": path.resolve(__dirname, "packages/actionmailbox/lib") + "/",
  "@blazetrails/actionmailbox": path.resolve(__dirname, "packages/actionmailbox/lib/index.ts"),
  "@blazetrails/actiontext/": path.resolve(__dirname, "packages/actiontext/lib") + "/",
  "@blazetrails/actiontext": path.resolve(__dirname, "packages/actiontext/lib/index.ts"),
  "@blazetrails/solid-queue/": path.resolve(__dirname, "packages/solid-queue/lib") + "/",
  "@blazetrails/solid-queue": path.resolve(__dirname, "packages/solid-queue/lib/index.ts"),
  "@blazetrails/trails-tsc": path.resolve(__dirname, "packages/trails-tsc/lib/index.ts"),
  "@blazetrails/trailties/code-statistics": path.resolve(
    __dirname,
    "packages/trailties/lib/code-statistics.ts",
  ),
  "@blazetrails/trailties/all": path.resolve(__dirname, "packages/trailties/lib/all.ts"),
  "@blazetrails/trailties/test-help": path.resolve(
    __dirname,
    "packages/trailties/lib/test-help.ts",
  ),
  "@blazetrails/trailties/trailties/":
    path.resolve(__dirname, "packages/trailties/lib/trailties") + "/",
  "@blazetrails/trailties/engine": path.resolve(__dirname, "packages/trailties/lib/engine.ts"),
  "@blazetrails/trailties/generators/test-case": path.resolve(
    __dirname,
    "packages/trailties/lib/generators/test-case.ts",
  ),
  "@blazetrails/trailties/generators": path.resolve(
    __dirname,
    "packages/trailties/lib/generators/index.ts",
  ),
  "@blazetrails/trailties/test-unit/trailtie": path.resolve(
    __dirname,
    "packages/trailties/lib/test-unit/trailtie.ts",
  ),
  "@blazetrails/trailties/trailtie/configuration": path.resolve(
    __dirname,
    "packages/trailties/lib/trailtie/configuration.ts",
  ),
  "@blazetrails/trailties/trailtie": path.resolve(__dirname, "packages/trailties/lib/trailtie.ts"),
  "@blazetrails/ruby-compat/": path.resolve(__dirname, "packages/ruby-compat/lib") + "/",
  "@blazetrails/ruby-compat": path.resolve(__dirname, "packages/ruby-compat/lib/index.ts"),
  "@blazetrails/bcrypt": path.resolve(__dirname, "packages/bcrypt/lib/index.ts"),
  "@blazetrails/vitest-matchers/setup": path.resolve(
    __dirname,
    "packages/vitest-matchers/lib/setup.ts",
  ),
  "@blazetrails/vitest-matchers": path.resolve(__dirname, "packages/vitest-matchers/lib/index.ts"),
  "@blazetrails/date": path.resolve(__dirname, "packages/date/lib/index.ts"),
  "@blazetrails/msgpack": path.resolve(__dirname, "packages/msgpack/lib/index.ts"),
  "@blazetrails/mail/": path.resolve(__dirname, "packages/mail/lib") + "/",
  "@blazetrails/mail": path.resolve(__dirname, "packages/mail/lib/index.ts"),
  "@blazetrails/thor/": path.resolve(__dirname, "packages/thor/lib") + "/",
  "@blazetrails/did-you-mean": path.resolve(__dirname, "packages/did-you-mean/lib/index.ts"),
  "@blazetrails/i18n": path.resolve(__dirname, "packages/i18n/lib/index.ts"),
  "@blazetrails/builder": path.resolve(__dirname, "packages/builder/lib/builder.ts"),
  "@blazetrails/marcel/magic": path.resolve(__dirname, "packages/marcel/lib/magic.ts"),
  "@blazetrails/marcel": path.resolve(__dirname, "packages/marcel/lib/marcel.ts"),
  "@blazetrails/mini-mime": path.resolve(__dirname, "packages/mini-mime/lib/mini-mime.ts"),
  "@blazetrails/net-smtp": path.resolve(__dirname, "packages/net-smtp/lib/smtp.ts"),
  "@blazetrails/rake": path.resolve(__dirname, "packages/rake/lib/rake.ts"),
  "@blazetrails/mini-magick/": path.resolve(__dirname, "packages/mini-magick/lib") + "/",
  "@blazetrails/image-processing/": path.resolve(__dirname, "packages/image-processing/lib") + "/",
  "@blazetrails/chronic": path.resolve(__dirname, "packages/chronic/lib/chronic.ts"),
  "@blazetrails/tzinfo": path.resolve(__dirname, "packages/tzinfo/lib/index.ts"),
  "@blazetrails/et-orbi": path.resolve(__dirname, "packages/et-orbi/lib/et-orbi.ts"),
  "@blazetrails/raabro": path.resolve(__dirname, "packages/raabro/lib/raabro.ts"),
  "@blazetrails/zeitwerk": path.resolve(__dirname, "packages/zeitwerk/lib/zeitwerk.ts"),
  "@blazetrails/vite-assets": path.resolve(__dirname, "packages/vite-assets/lib/index.ts"),
  "@blazetrails/fugit": path.resolve(__dirname, "packages/fugit/lib/fugit.ts"),
  "@blazetrails/nokogiri": path.resolve(__dirname, "packages/nokogiri/lib/index.ts"),
  "@blazetrails/html-sanitizer": path.resolve(__dirname, "packages/html-sanitizer/lib/index.ts"),
};

// Reporting-only code-coverage config (v8 provider — no instrumentation step,
// faster than istanbul). Wired into the non-blocking `Coverage` CI job, which
// passes `--coverage` (and `--coverage.all` to count untested files in the
// denominator). No `thresholds` key is set, so coverage NEVER fails the build.
//
// activerecord / activerecord-cli are excluded from the light-package baseline:
// their suite forks 6 workers and dominates CI time. AR coverage is collected
// separately on the sqlite lane only (story ar-sqlite-lane-coverage-reporting,
// RFC 0028) by setting AR_COVERAGE=1, which flips the include/exclude below to
// scope coverage to activerecord source. Keeping it env-gated means the light
// `coverage` job's `--coverage.all` baseline stays honest (it never counts AR
// source at 0%, and the AR run never counts the light packages at 0%).
// website is excluded (built, not unit-tested here).
const AR_COVERAGE = process.env.AR_COVERAGE === "1";
// activerecord-cli coverage runs in its own non-blocking job (story
// ar-cli-coverage-reporting, RFC 0028), separate from the AR_COVERAGE run so a
// second vitest invocation against the shared ./coverage dir can't clobber the
// activerecord report. AR_CLI_COVERAGE=1 scopes the include/denominator to
// activerecord-cli source, mirroring the AR_COVERAGE flip so its `--coverage.all`
// baseline stays honest (no cross-package 0% skew).
const AR_CLI_COVERAGE = process.env.AR_CLI_COVERAGE === "1";
// trails-tsc coverage runs in its own isolated CI job (story
// trails-tsc-coverage-isolation, RFC 0028). Its watcher/build tests spawn
// subprocesses that trip vitest's worker-RPC `onTaskUpdate` timeout under
// load, aborting the run and writing NO report. Run alone (its own job, one
// fork via TRAILS_TEST_FORKS=1), a timeout can only void trails-tsc's own
// numbers, never the shared non-AR baseline. TRAILS_TSC_COVERAGE=1 scopes the
// include/denominator to trails-tsc source, mirroring the AR_COVERAGE flip so
// each isolated run's `--coverage.all` baseline stays honest (no cross-package
// 0% skew).
const TRAILS_TSC_COVERAGE = process.env.TRAILS_TSC_COVERAGE === "1";
const COVERAGE_INCLUDE = AR_COVERAGE
  ? ["packages/activerecord/lib/**/*.ts", "packages/activerecord/lib/**/*.mts"]
  : AR_CLI_COVERAGE
    ? ["packages/activerecord-cli/lib/**/*.ts", "packages/activerecord-cli/lib/**/*.mts"]
    : TRAILS_TSC_COVERAGE
      ? ["packages/trails-tsc/lib/**/*.ts", "packages/trails-tsc/lib/**/*.mts"]
      : ["packages/*/{src,lib}/**/*.ts", "packages/*/{src,lib}/**/*.mts"];
const COVERAGE_EXCLUDE = [
  "**/*.test.ts",
  "**/*.test.mts",
  "**/*.d.ts",
  "**/dist/**",
  "**/__snapshots__/**",
  "**/test-helpers/**",
  "**/test-support/**",
  "**/*.config.ts",
  "packages/website/**",
  // The AR run scopes COVERAGE_INCLUDE to activerecord; the AR_CLI run scopes it
  // to activerecord-cli; the light baseline run excludes both (the 6-fork AR
  // suite dominates CI time and isn't run there). Each run excludes the sibling
  // package so its `--coverage.all` denominator never counts it at 0%.
  ...(AR_COVERAGE ? ["packages/activerecord-cli/**"] : []),
  ...(AR_CLI_COVERAGE ? ["packages/activerecord/**"] : []),
  ...(!AR_COVERAGE && !AR_CLI_COVERAGE
    ? ["packages/activerecord/**", "packages/activerecord-cli/**"]
    : []),
  // trails-tsc is covered only in its own isolated job (TRAILS_TSC_COVERAGE=1);
  // in every other run its subprocess-spawning watcher/build tests aren't
  // executed, so exclude its source so `--coverage.all` doesn't count it at 0%
  // and skew the baseline.
  ...(TRAILS_TSC_COVERAGE ? [] : ["packages/trails-tsc/**"]),
  "packages/*/dx-tests/**",
  "packages/*/virtualized-dx-tests/**",
];

const aliasEntries = [
  {
    find: /^@blazetrails\/activesupport\/testing\/(.+)$/,
    replacement: path.resolve(__dirname, "packages/activesupport/lib/testing") + "/$1.ts",
  },
  {
    find: /^@blazetrails\/image-processing$/,
    replacement: path.resolve(__dirname, "packages/image-processing/lib/image-processing.ts"),
  },
  {
    find: /^@blazetrails\/mini-magick$/,
    replacement: path.resolve(__dirname, "packages/mini-magick/lib/mini-magick.ts"),
  },
  {
    find: /^@blazetrails\/thor$/,
    replacement: path.resolve(__dirname, "packages/thor/lib/thor.ts"),
  },
  {
    find: /^@blazetrails\/trailties$/,
    replacement: path.resolve(__dirname, "packages/trailties/lib/index.ts"),
  },
  ...Object.entries(alias).map(([find, replacement]) => ({ find, replacement })),
];

const otherResolve = {
  alias: [
    ...aliasEntries,
    // A generated app under tmp/ must share the suite's source Trails, not dist's.
    {
      find: /^@blazetrails\/trailties\/(trails|test-unit\/trailtie)$/,
      replacement: path.resolve(__dirname, "packages/trailties/lib") + "/$1.ts",
    },
    {
      find: /^@blazetrails\/trailties$/,
      replacement: path.resolve(__dirname, "packages/trailties/lib/index.ts"),
    },
    { find: /^eslint$/, replacement: path.resolve(__dirname, "node_modules/eslint/lib/api.js") },
  ],
};

// Arel's suite needs `Arel::Table.engine` set, exactly as Rails' does
// (it runs under activerecord, where the engine is ActiveRecord::Base).
const otherSetupFiles = [
  "./packages/vitest-matchers/lib/setup.ts",
  "./packages/activesupport/lib/testing/autorun.ts",
  "./packages/activesupport/test/support/test-setup-abstract-unit.ts",
  "./packages/arel/test/support/test-setup-engine.ts",
  "./packages/actionview/test/support/setup-compile-template.ts",
  "./packages/ruby-compat/test-setup/class-paths.ts",
];

export default defineConfig({
  resolve: { alias: aliasEntries },
  test: {
    globals: true,
    // MUST live at the ROOT config: vitest 3's shared fork pool sizes itself
    // from the root `poolOptions.forks.maxForks` only (createForksPool never
    // consults per-project poolOptions — a project-level `maxForks` is a
    // silent no-op and the cap falls back to `numCpus - 1`, which on a
    // many-core host forks every file at once and exhausts the AR_DB
    // advisory-slot pool: "all N GET_LOCK slots are held").
    poolOptions: { forks: { maxForks: TEST_FORKS } },
    // In the isolated trails-tsc coverage run, the build-views/watch tests are
    // CPU-pegged in tsc under v8 instrumentation long enough to starve vitest's
    // reporter heartbeat, surfacing a `Timeout calling "onTaskUpdate"` worker
    // RPC error as an UNHANDLED error — which fails the run even though every
    // test passes and the coverage report is fully written. Ignore unhandled
    // errors ONLY in this isolated, reporting-only run so the timeout can't
    // redden a job whose sole purpose is to emit numbers. Never set elsewhere:
    // in the shared runs an unhandled error is a real signal.
    // AR_CLI_COVERAGE is included here for the same reason as TRAILS_TSC_COVERAGE:
    // the cli suite's trails-tsc E2E tests spawn tsc subprocesses that, under v8
    // instrumentation, peg a worker long enough to trip the `onTaskUpdate` RPC
    // timeout (an unhandled error) even when every test passes and the report is
    // written. Ignore it ONLY in these isolated, reporting-only runs.
    // AR_COVERAGE is included for the same reason: the full AR sqlite suite under
    // v8 `--coverage.all` is a ~550s run whose end-of-run report generation pegs
    // the main thread long enough to starve the worker's reporter heartbeat,
    // surfacing the same `onTaskUpdate` RPC timeout as an unhandled error AFTER
    // every test has passed and the coverage summary is written — reddening a
    // job whose sole purpose is to emit numbers. Ignore it ONLY in this isolated,
    // reporting-only run; the gating AR suite (`sqlite-tests`) runs without
    // coverage and keeps unhandled errors as a real signal.
    dangerouslyIgnoreUnhandledErrors: TRAILS_TSC_COVERAGE || AR_CLI_COVERAGE || AR_COVERAGE,
    coverage: {
      provider: "v8",
      // text-summary → CI log; json-summary → parsed into the step summary;
      // json + lcov → uploaded as artifacts for external tooling.
      reporter: ["text-summary", "json-summary", "json", "lcov"],
      reportsDirectory: "./coverage",
      include: COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
    },
    projects: [
      {
        // All activerecord tests. Each fork gets its own database (activerecord_unittest_N
        // for PG/MySQL, provisioned via AR_DB_FORKS) so files can run in parallel.
        // SQLite is file-backed too: globalSetup builds one on-disk template and
        // each fork restores it into its own private `.sqlite` clone stamped into
        // AR_TEST_WORKER_DB (see support/sqlite-template.ts).
        resolve: { alias: aliasEntries },
        test: {
          name: "activerecord",
          include: [
            "packages/activerecord/test/**/*.test.ts",
            "packages/activerecord/scripts/**/*.test.ts",
            "packages/solid-queue/test/**/*.test.ts",
            "packages/solid-cable/test/**/*.test.ts",
            "packages/solid-cache/test/**/*.test.ts",
            "packages/activestorage/test/**/*.test.ts",
            "packages/actionmailbox/test/**/*.test.ts",
            "packages/actiontext/test/**/*.test.ts",
          ],
          exclude: [
            ...SHARED_EXCLUDE,
            ...ADAPTER_SPECIFIC_EXCLUDE,
            ...SQLITE_DRIVER_TESTS,
            "packages/solid-cable/test/generators/**",
            "packages/solid-queue/test/generators/**",
            "packages/actionmailbox/test/generators/**",
            "packages/actiontext/test/generators/**",
          ],
          // Phase 0 sqlite template-clone (perf): build the canonical schema
          // into a template file once for the whole run; workers clone it
          // instead of re-issuing the DDL per file. No-op on PG/MySQL runs.
          globalSetup: ["./packages/activerecord/test/support/template-global-setup.ts"],
          setupFiles: [
            "./packages/activerecord/test/support/test-setup-worker-db.ts",
            "./packages/vitest-matchers/lib/setup.ts",
            // `ActiveSupport::TestCase`'s include list (test_case.rb:144-153),
            // which helper.rb picks up by requiring active_support/test_case.
            "./packages/activesupport/lib/testing/autorun.ts",
            "./packages/activerecord/test/cases/helper.ts",
            "./packages/bcrypt/lib/index.ts",
            "./packages/actionview/test/support/setup-compile-template.ts",
            ...(process.env.ARCONN === "mysql2"
              ? ["./packages/activerecord/test/support/test-setup-mysql.ts"]
              : []),
            ...(process.env.ARCONN === "postgresql"
              ? ["./packages/activerecord/test/support/test-setup-pg-cancel-trace.ts"]
              : []),
            "./packages/activerecord/test/support/test-setup-dy.ts",
            "./packages/ruby-compat/test-setup/class-paths.ts",
            // Opt-in DDL timing profiler, gated on DDL_PROFILE=1 (dormant/no-op when off).
            ...(process.env.DDL_PROFILE === "1"
              ? ["./packages/activerecord/test/support/test-setup-ddl-profile.ts"]
              : []),
          ],
          retry: 0,
          // Large-schema beforeAll(defineSchema(...)) calls on MySQL issue
          // hundreds of CREATE TABLE statements (e.g. has-many-associations.test.ts
          // creates ~354 tables in one beforeAll). At ~30ms per CREATE on MySQL
          // that's ~10.7s, just over the 10s vitest default and a frequent CI
          // flake source. Bump to 30s to absorb DDL load + CI contention.
          // beforeAll-side existence checks no longer batch (phase-F DDL
          // tracking removal).
          hookTimeout: 30_000,
          pool: "forks",
        },
      },
      {
        // SQLite driver wrappers + driver-binding tests: pure unit tests, no
        // AR setup (see SQLITE_DRIVER_TESTS). Excluded from the "activerecord"
        // project above so they don't load the connection bootstrap.
        resolve: { alias: aliasEntries },
        test: {
          name: "sqlite-drivers",
          include: SQLITE_DRIVER_TESTS,
          exclude: [...SHARED_EXCLUDE],
          setupFiles: ["./packages/ruby-compat/test-setup/class-paths.ts"],
        },
      },
      {
        // All non-AR packages + scripts: parallel, no DB concerns.
        resolve: otherResolve,
        test: {
          name: "other",
          // Projects do NOT inherit the root `test.globals`, and ESLint's
          // RuleTester registers its cases through whatever describe/it it
          // finds on globalThis at import time. Without this, every
          // eslint/*.test.mjs that drives RuleTester alone registers zero
          // cases and collects as "No test suite found in file".
          globals: true,
          include: [
            "packages/*/src/**/*.test.ts",
            "packages/*/test/**/*.test.ts",
            "scripts/guides-typecheck/*.test.ts",
            "scripts/api-compare/*.test.ts",
            "scripts/fixtures-compare/*.test.ts",
            "scripts/schema-compare/*.test.ts",
            "scripts/parity/**/*.test.ts",
            "scripts/*.test.ts",
            "scripts/ci/*.test.mjs",
            "scripts/test-deps/*.test.ts",
            "scripts/tasks/*.test.ts",
            "scripts/test-compare/*.test.ts",
            "scripts/rails-find/*.test.ts",
            "scripts/sync-stats/*.test.ts",
            "scripts/layout/*.test.ts",
            "eslint/*.test.mjs",
            "vendor/*.test.ts",
          ],
          exclude: [
            "packages/activerecord/**",
            "packages/solid-queue/**",
            "packages/solid-cable/**",
            "packages/solid-cache/**",
            "packages/activestorage/**",
            "packages/actionmailbox/**",
            "packages/actiontext/**",
            "packages/trailties/**",
            "packages/thor/**",
            "packages/et-orbi/**",
            "packages/raabro/**",
            "packages/zeitwerk/**",
            "packages/vite-assets/**",
            "packages/fugit/**",
            ...(ARCONN === "postgresql"
              ? []
              : ["packages/actioncable/test/subscription-adapter/postgresql.test.ts"]),
            ...(process.env.REDIS_URL
              ? []
              : ["packages/actioncable/test/subscription-adapter/redis.test.ts"]),
            ...SHARED_EXCLUDE,
          ],
          globalSetup: ["./packages/actionview/test/support/build-precompiled-fixtures.ts"],
          setupFiles: otherSetupFiles,
        },
      },
      {
        // System tests (RFC 0166): Node workers that each launch one real
        // browser. `screenshotDirectory` reaches the worker through `inject`,
        // since Vitest does not serialize `browser.screenshotDirectory`.
        resolve: otherResolve,
        test: {
          name: "system",
          globals: true,
          include: ["packages/*/{src,test}/**/*.system.test.ts"],
          exclude: SHARED_EXCLUDE.filter((glob) => glob !== "**/*.system.test.ts"),
          setupFiles: otherSetupFiles,
          pool: "forks",
          browser: { enabled: false, screenshotDirectory: SYSTEM_SCREENSHOT_DIRECTORY },
          provide: { screenshotDirectory: SYSTEM_SCREENSHOT_DIRECTORY },
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "trailties",
          globals: true,
          include: [
            "packages/trailties/test/**/*.test.ts",
            "packages/solid-cable/test/generators/**/*.test.ts",
            "packages/solid-queue/test/generators/**/*.test.ts",
            "packages/actionmailbox/test/generators/**/*.test.ts",
            "packages/actiontext/test/generators/**/*.test.ts",
          ],
          exclude: SHARED_EXCLUDE,
          globalSetup: [
            "./packages/trailties/test/support/build-templates.ts",
            "./packages/trailties/test/support/isolation/global-setup.ts",
            "./packages/solid-cable/test/support/build-templates.ts",
            "./packages/solid-queue/test/support/build-templates.ts",
            "./packages/actionmailbox/test/support/build-templates.ts",
            "./packages/actiontext/test/support/build-templates.ts",
          ],
          setupFiles: otherSetupFiles,
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "thor",
          globals: true,
          include: ["packages/thor/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          globalSetup: ["./scripts/thor-build-templates.ts"],
          setupFiles: [...otherSetupFiles, "./packages/thor/test/support/setup.ts"],
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "et-orbi",
          globals: true,
          include: ["packages/et-orbi/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          testTimeout: 30_000,
          setupFiles: [
            "./packages/vitest-matchers/lib/setup.ts",
            "./packages/ruby-compat/test-setup/class-paths.ts",
          ],
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "zeitwerk",
          globals: true,
          include: ["packages/zeitwerk/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          setupFiles: ["./packages/ruby-compat/test-setup/class-paths.ts"],
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "vite-assets",
          globals: true,
          include: ["packages/vite-assets/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          setupFiles: ["./packages/ruby-compat/test-setup/class-paths.ts"],
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "raabro",
          globals: true,
          include: ["packages/raabro/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          setupFiles: ["./packages/ruby-compat/test-setup/class-paths.ts"],
        },
      },
      {
        resolve: otherResolve,
        test: {
          name: "fugit",
          globals: true,
          include: ["packages/fugit/test/**/*.test.ts"],
          exclude: SHARED_EXCLUDE,
          setupFiles: [
            "./packages/vitest-matchers/lib/setup.ts",
            "./packages/ruby-compat/test-setup/class-paths.ts",
          ],
        },
      },
    ],
  },
});
