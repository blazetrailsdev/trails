/**
 * On-disk scratch sqlite databases for the sqlite arm of
 * {@link ../support/isolated-database.js openIsolatedDatabase}.
 *
 * This is a trails-only construct: Rails' suite has exactly two databases,
 * `arunit` and `arunit2` (`config.example.yml:83-91`), both fixed files reused
 * across runs. A test needing a second database rides `ARUnit2Model`'s pool —
 * `MultiDbMigratorTest` takes `ARUnit2Model.connection_pool`
 * (`multi_db_migrator_test.rb:23`) and `OtherDog < ARUnit2Model`
 * (`test/models/other_dog.rb`) is a canonical model, not an inline one. Both of
 * those ride the canonical pair here too.
 *
 * What remains is the case Rails genuinely has no counterpart for: a suite that
 * wipes a database wholesale. Rails runs it in its own process against its own
 * `arunit`; trails shares one database per *vitest worker* across files, so it
 * needs a throwaway. Converging that away is story
 * `converge-isolated-database-onto-canonical-pools`.
 *
 * `:memory:` is the wrong stand-in: it silently makes every connection its own
 * private database, which is exactly the divergence RFC 0029 exists to remove.
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
