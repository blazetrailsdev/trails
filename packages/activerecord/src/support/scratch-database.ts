/**
 * On-disk scratch sqlite databases for tests whose Rails counterpart runs
 * against a *distinct* database rather than `ActiveRecord::Base`'s own.
 *
 * Rails never opens a `:memory:` database in these spots — `arunit` and
 * `arunit2` are both files in `config.example.yml`, so a test that needs a
 * second, independent database (`MultiDbMigratorTest`'s two pools, the
 * `AnimalsBase` pool behind `OtherDog`) gets a file, and a test that mutates a
 * schema `ActiveRecord::Base` shares (`AdapterPreventWritesTest`'s
 * create/drop of `subscribers`) gets one too rather than scribbling on the
 * worker's canonical database.
 *
 * `:memory:` is the wrong stand-in for either: it silently makes every
 * connection its own private database, which is exactly the divergence RFC
 * 0029 exists to remove. A file path keeps the "two adapters, one database"
 * and "two databases, one process" distinctions real.
 *
 * @internal
 */

import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { registerDbFileCleanupOnExit, unlinkDbFiles } from "./sqlite-template.js";

/**
 * Resolved paths, keyed by label. One label is one database for the life of the
 * worker, exactly as `arunit`/`arunit2` are one database for the life of a Rails
 * run — reopening the same label hands back the same file. It also keeps the
 * exit-cleanup listeners bounded: `registerDbFileCleanupOnExit` attaches one per
 * distinct path, and a per-call unique name would exhaust the emitter's limit.
 */
const paths = new Map<string, Promise<string>>();

/**
 * An absolute path to an on-disk sqlite database for `label`, wiped on first
 * use and registered for best-effort cleanup when the worker exits.
 *
 * The name carries the run token and the worker's isolation slot (the same two
 * discriminators `sqlite-template.ts` uses for the worker clone) so parallel
 * vitest workers — and parallel worktrees sharing one tmpdir — cannot land on
 * the same file. `label` discriminates *within* a worker, so name it after the
 * test file that owns it: two files sharing a label would share a database.
 */
export function scratchDatabasePath(label: string): Promise<string> {
  let resolved = paths.get(label);
  if (!resolved) {
    resolved = buildScratchDatabasePath(label);
    paths.set(label, resolved);
  }
  return resolved;
}

async function buildScratchDatabasePath(label: string): Promise<string> {
  const path = await getPathAsync();
  const os = await getOsAsync();
  const runToken = getEnv("AR_TEST_RUN_TOKEN") || "x";
  const slot = getEnv("VITEST_POOL_ID") || getEnv("VITEST_WORKER_ID") || "1";
  const dbPath = path.join(os.tmpdir(), `ar-test-${label}-${runToken}-${slot}.sqlite`);
  // A run killed before its exit handlers fire leaves the file behind, and a
  // stale database would hand the caller someone else's schema.
  unlinkDbFiles(await getFsAsync(), dbPath);
  await registerDbFileCleanupOnExit(dbPath);
  return dbPath;
}
