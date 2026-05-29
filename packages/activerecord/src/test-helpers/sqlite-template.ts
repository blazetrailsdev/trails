/**
 * SQLite template-clone helpers (Phase 0 perf spike).
 *
 * Rails builds the test schema once via `db:test:prepare`, then every forked
 * worker runs against the already-prepared DB. This is the sqlite analog:
 * `globalSetup` builds a canonical template file once for the whole vitest
 * invocation (see `sqlite-template-global-setup.ts`), and each worker copies
 * that template to a private on-disk DB instead of re-running hundreds of
 * `CREATE TABLE` statements per file.
 *
 * SQLite only. PG/MariaDB are out of scope for the spike — their phases land
 * separately and keep the current per-worker preload until then.
 *
 * Hard rule: no `node:*` / `process.*` fs APIs — all filesystem access goes
 * through the activesupport fs-adapter. The clone path uses the adapter's
 * sync `copyFileSync` / `unlinkSync` (the one-shot copy and the exit-handler
 * unlink are simplest synchronous); async callers use `getFsAsync` / `exists`.
 * `process.env` reads are allowed (the env carries the handoff from
 * globalSetup to forked workers).
 */
import type { FsAdapter } from "@blazetrails/activesupport/fs-adapter";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";

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
/** Env var: per-worker cloned DB path (stamped by the worker setupFile). */
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
// persists). Lets the clone happen once per worker, not once per file.
const g = globalThis as typeof globalThis & { __arWorkerDbPath?: string };

/**
 * Ensure this worker has a private clone of the template DB and return its
 * path. The clone is deterministic per (run token, worker slot), so the
 * first test file in a worker copies it and the rest reuse the same warm
 * file. Returns `null` when there is no template to clone from.
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
    fs.copyFileSync(template, dest);
  }
  // Best-effort cleanup on process exit. Registered once per worker.
  // WAL mode (the sqlite adapter's default for file DBs) leaves `-wal`/`-shm`
  // sidecars next to the main file; unlink those too so nothing lingers.
  process.on("exit", () => unlinkDbFiles(fs, dest));

  g.__arWorkerDbPath = dest;
  return dest;
}
