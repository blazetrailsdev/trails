/**
 * SQLite template-clone helpers (Phase 0 perf spike).
 *
 * Rails builds the test schema once via `db:test:prepare`, then every forked
 * worker runs against the already-prepared DB. This is the sqlite analog:
 * `globalSetup` builds a canonical template file once for the whole vitest
 * invocation (see `sqlite-template-global-setup.ts`), and each worker restores
 * that template into a private on-disk DB instead of re-running hundreds of
 * `CREATE TABLE` statements per file.
 *
 * The restore goes through the SqliteDriver's `restoreFromPath` backup
 * primitive (SQLite's online-backup) rather than a raw `copyFile`: backup
 * page-copies a live source and folds in any WAL pages, so the clone is
 * consistent even if the template was left in WAL mode. Drivers without the
 * primitive (e.g. expo-sqlite) fall back to a filesystem copy.
 *
 * NOTE (memory-restore follow-up): the original plan was a per-worker
 * `:memory:` DB restored from the template, to drop the on-disk per-query I/O
 * tax. That is NOT achievable with the better-sqlite3 build trails ships:
 * better-sqlite3 does not set `SQLITE_OPEN_URI`, so a
 * `file:name?mode=memory&cache=shared` URI is opened as a *literal on-disk
 * file*, not a shared in-memory DB. The test infra opens several independent
 * connections/handlers (the bootstrap handler + the pooled test adapter) that
 * must observe the same schema, and without shared-cache there is no way to
 * share one `:memory:` DB across them. So the worker DB stays an on-disk file
 * here; lifting the I/O tax needs a driver that honors `file:` URIs (or a
 * single-connection worker architecture). See the PR body for the spike data.
 *
 * SQLite only. PG/MariaDB are out of scope for the spike — their phases land
 * separately and keep the current per-worker preload until then.
 *
 * Hard rule: no `node:*` fs APIs — all filesystem access goes through the
 * activesupport fs-adapter. `process` is used only for runtime plumbing, not
 * fs: `process.env` reads carry the globalSetup → forked-worker handoff, and
 * `process.on("exit")` registers best-effort cleanup of the worker clone and,
 * via `registerDbFileCleanupOnExit`, of file DBs owned by `process`-free
 * modules.
 */
import type { FsAdapter } from "@blazetrails/activesupport/fs-adapter";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { activeLane } from "./connection.js";

/** WAL sidecars sqlite writes alongside a file DB, plus the DB file itself. */
const DB_FILE_SUFFIXES = ["", "-wal", "-shm"] as const;

/**
 * Unlink a sqlite file DB and its WAL sidecars (`-wal`, `-shm`). Best-effort
 * and synchronous so it can run from a `process.on("exit")` handler.
 */
export function unlinkDbFiles(fs: FsAdapter, base: string): void {
  for (const suffix of DB_FILE_SUFFIXES) {
    try {
      fs.unlinkSync(base + suffix);
    } catch {
      // already gone / never created — nothing to do.
    }
  }
}

const cleanupG = globalThis as typeof globalThis & { __arDbCleanupPaths?: Set<string> };

/**
 * Register a best-effort `process.on("exit")` unlink of a sqlite file DB and
 * its WAL sidecars, at most once per path per process.
 *
 * Best-effort really means it: vitest's fork pool signals its workers dead, and
 * a signalled process never runs `"exit"` listeners. {@link sweepRunDbFiles} in
 * globalSetup's teardown is what guarantees the files go away; this listener
 * only makes them go away *sooner* when a worker does exit cleanly.
 *
 * The de-dupe set hangs off `globalThis`, not module scope: vitest's
 * `isolate: true` reloads the module graph per test file, so a module-level
 * set would re-register — and leak — one exit listener per file.
 */
export async function registerDbFileCleanupOnExit(base: string): Promise<void> {
  const registered = (cleanupG.__arDbCleanupPaths ??= new Set<string>());
  if (registered.has(base)) return;
  // Claimed before the await so concurrent callers can't both get past the
  // check, but released again if attaching fails — otherwise a rejected
  // `getFsAsync()` would mark the path registered with no listener behind it,
  // silently forfeiting cleanup for the rest of the process.
  registered.add(base);
  try {
    const fs = await getFsAsync();
    process.on("exit", () => unlinkDbFiles(fs, base));
  } catch (error) {
    registered.delete(base);
    throw error;
  }
}

/**
 * Shared filename prefix of every temp sqlite DB the AR test harness creates:
 * the template, the per-worker clones and their `_2` arunit2 siblings.
 */
export const TEMP_DB_PREFIX = "ar-test-";

/**
 * Age past which an `ar-test-*` file in tmpdir is assumed to be orphaned by an
 * earlier run and swept. No AR test run comes near this, so the cutoff cannot
 * pull a file out from under a *concurrent* run — which a blanket
 * prefix-unlink would, since parallel worktrees share one tmpdir.
 */
const STALE_DB_AGE_MS = 6 * 60 * 60 * 1000;

/** Temp-dir entries the harness owns, or `[]` when the fs adapter can't list. */
async function tempDbEntries(fs: FsAdapter): Promise<string[]> {
  if (!fs.readdir) return [];
  try {
    return (await fs.readdir(await tmpRoot())).filter((name) => name.startsWith(TEMP_DB_PREFIX));
  } catch {
    return [];
  }
}

async function unlinkQuietly(fs: FsAdapter, target: string): Promise<void> {
  try {
    await fs.unlink?.(target);
  } catch {
    // best-effort
  }
}

/**
 * Unlink every temp DB file stamped with `runToken`, whatever created it.
 *
 * This is the cleanup that actually survives the run: the
 * `registerDbFileCleanupOnExit` listeners live in vitest's forked workers, and
 * tinypool tears those down with a signal rather than a clean shutdown, so
 * `"exit"` handlers never run and each run leaks its worker clones, scratch
 * DBs and WAL sidecars. Sweeping from globalSetup's teardown — the one place
 * that outlives every worker — collects them regardless of how the worker died.
 *
 * Matching is by run token, not by prefix alone, so a concurrent run's live
 * databases are never touched.
 */
export async function sweepRunDbFiles(runToken: string): Promise<void> {
  const [fs, path] = [await getFsAsync(), await getPathAsync()];
  const root = await tmpRoot();
  const stamp = `-${runToken}`;
  await Promise.all(
    (await tempDbEntries(fs))
      .filter((name) => name.includes(stamp))
      .map((name) => unlinkQuietly(fs, path.join(root, name))),
  );
}

/**
 * Unlink temp DB files left behind by runs that predate the token sweep (or
 * that were killed before their teardown ran, e.g. a `^C`-ed vitest). Runs at
 * globalSetup time, when nothing of this run exists yet.
 */
export async function sweepStaleDbFiles(): Promise<void> {
  const [fs, path] = [await getFsAsync(), await getPathAsync()];
  if (!fs.stat) return;
  const root = await tmpRoot();
  const cutoff = Date.now() - STALE_DB_AGE_MS;
  await Promise.all(
    (await tempDbEntries(fs)).map(async (name) => {
      const target = path.join(root, name);
      try {
        if ((await fs.stat!(target)).mtime.getTime() >= cutoff) return;
      } catch {
        return;
      }
      await unlinkQuietly(fs, target);
    }),
  );
}

/** Env var: absolute path of the canonical template DB built by globalSetup. */
export const TEMPLATE_PATH_ENV = "AR_TEST_TEMPLATE_PATH";
/** Env var: per-run token (stamped by globalSetup) so concurrent worktrees don't collide. */
export const RUN_TOKEN_ENV = "AR_TEST_RUN_TOKEN";
/** Env var: per-worker restored DB path (stamped by the worker setupFile). */
export const WORKER_DB_ENV = "AR_TEST_WORKER_DB";

/** True when the connection named by ARCONN rides a sqlite lane. */
export function isSqliteRun(): boolean {
  return activeLane() === "sqlite";
}

/** Temp directory root, via the os-adapter so the path is portable (TMPDIR/TEMP/TMP). */
async function tmpRoot(): Promise<string> {
  return (await getOsAsync()).tmpdir();
}

/** Path of the canonical template DB for a given run token. */
export async function templatePathFor(runToken: string): Promise<string> {
  const path = await getPathAsync();
  return path.join(await tmpRoot(), `ar-test-template-${runToken}.sqlite`);
}

// Shared across re-evaluations of the worker setupFile within one worker
// process (isolate:true reloads the module graph per file, but globalThis
// persists). Lets the restore happen once per worker, not once per file.
const g = globalThis as typeof globalThis & { __arWorkerDbPath?: string };

/**
 * Ensure this worker has a private clone of the template DB and return its
 * path. The clone is deterministic per (run token, worker slot), so the
 * first test file in a worker restores it and the rest reuse the same warm
 * file. The restore prefers the driver's `restoreFromPath` backup primitive
 * (WAL-consistent) and falls back to a filesystem copy for drivers that lack
 * it. Returns `null` when there is no template to clone from.
 */
export async function ensureWorkerClone(): Promise<string | null> {
  if (g.__arWorkerDbPath) return g.__arWorkerDbPath;

  const template = process.env[TEMPLATE_PATH_ENV];
  if (!template || !isSqliteRun()) return null;

  const path = await getPathAsync();
  const fs = await getFsAsync();
  const runToken = process.env[RUN_TOKEN_ENV] ?? "x";
  const slot = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  const dest = path.join(await tmpRoot(), `ar-test-worker-${runToken}-${slot}.sqlite`);

  if (!(await fs.exists(dest))) {
    const driver = betterSqlite3Driver;
    if (driver.restoreFromPath) {
      await driver.restoreFromPath(template, dest);
    } else {
      fs.copyFileSync(template, dest);
    }
  }
  await registerDbFileCleanupOnExit(dest);

  g.__arWorkerDbPath = dest;
  return dest;
}
