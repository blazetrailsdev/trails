/**
 * vitest `globalSetup` for the activerecord (sqlite) project — Phase 0 spike.
 *
 * Runs ONCE in the main process before any worker forks. Builds the canonical
 * `TEST_SCHEMA` into a template sqlite file, then closes it. Workers clone
 * that file instead of re-running the canonical DDL per test file (see
 * `sqlite-template.ts`). The template path + run token are handed to workers
 * via `process.env`; vitest's forks pool inherits the parent env at fork time.
 *
 * Returns a teardown fn that unlinks the template (async fs-adapter). SQLite
 * only — no-op on PG/MySQL runs.
 *
 * Hard rule: no `node:*` fs APIs — async fs-adapter only.
 */
import "@blazetrails/activesupport/sqlite/better-sqlite3";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import type { DatabaseAdapter } from "../adapter.js";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { defineSchema } from "./define-schema.js";
import { TEST_SCHEMA } from "./test-schema.js";
import {
  RUN_TOKEN_ENV,
  TEMPLATE_PATH_ENV,
  isSqliteRun,
  templatePathFor,
  unlinkDbFiles,
} from "./sqlite-template.js";

// Acceptance probe: the canonical DDL must run exactly once for a whole
// multi-file run. globalSetup is invoked once per project, so a second
// increment means the contract is broken.
let _builds = 0;

export default async function setup(): Promise<(() => Promise<void>) | undefined> {
  if (!isSqliteRun()) return undefined;

  if (++_builds > 1) {
    throw new Error(`sqlite template globalSetup ran ${_builds} times; expected exactly once`);
  }

  const runToken = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const templatePath = await templatePathFor(runToken);

  const adapter = new SQLite3Adapter(templatePath);
  try {
    await defineSchema(adapter as unknown as DatabaseAdapter, TEST_SCHEMA);
  } finally {
    await adapter.close();
  }

  process.env[TEMPLATE_PATH_ENV] = templatePath;
  process.env[RUN_TOKEN_ENV] = runToken;

  return async () => {
    // Remove the template DB plus its WAL sidecars (-wal/-shm).
    unlinkDbFiles(await getFsAsync(), templatePath);
  };
}
