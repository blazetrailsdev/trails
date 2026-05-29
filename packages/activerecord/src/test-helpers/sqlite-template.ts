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
 * `process.on("exit")` registers best-effort cleanup of the worker clone.
 */
import type { FsAdapter } from "@blazetrails/activesupport/fs-adapter";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { getSqliteAsync } from "@blazetrails/activesupport/sqlite-adapter";

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

/** Env var: absolute path of the canonical template DB built by globalSetup. */
export const TEMPLATE_PATH_ENV = "AR_TEST_TEMPLATE_PATH";
/** Env var: per-run token (stamped by globalSetup) so concurrent worktrees don't collide. */
export const RUN_TOKEN_ENV = "AR_TEST_RUN_TOKEN";
/** Env var: per-worker restored DB path (stamped by the worker setupFile). */
export const WORKER_DB_ENV = "AR_TEST_WORKER_DB";

/** True when the active run targets sqlite (no PG/MySQL URL present). */
export function isSqliteRun(): boolean {
  return !process.env.PG_TEST_URL && !process.env.MYSQL_TEST_URL;
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
    const driver = await getSqliteAsync();
    if (driver.restoreFromPath) {
      await driver.restoreFromPath(template, dest);
    } else {
      fs.copyFileSync(template, dest);
    }
  }
  // Best-effort cleanup on process exit. Registered once per worker.
  // WAL mode (the sqlite adapter's default for file DBs) leaves `-wal`/`-shm`
  // sidecars next to the main file; unlink those too so nothing lingers.
  process.on("exit", () => unlinkDbFiles(fs, dest));

  g.__arWorkerDbPath = dest;
  return dest;
}
