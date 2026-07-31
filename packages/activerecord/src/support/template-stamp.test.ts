/**
 * The sqlite half of `pg-template.test.ts`: confirms globalSetup stamped the
 * canonical-schema template its workers clone, which is what puts the worker
 * that claims a clone on `test-setup-dy.ts`'s TRUNCATE fast path instead of a
 * purge + full canonical reload.
 *
 * Only sqlite is probed. MySQL is stamped by the same `buildTemplateSchema`
 * helper, but it has no `CREATE DATABASE ... TEMPLATE` primitive, so globalSetup
 * lays the schema straight into each slot DB — and the first worker to boot onto
 * a slot consumes the stamp (`resetTestTables` drops `ar_internal_metadata`
 * along with the other bookkeeping tables). There is therefore no MySQL artifact
 * a test can read the stamp back off. The sqlite template file is never booted
 * onto, so it keeps its stamp for the whole run.
 *
 * Skipped automatically off the sqlite lane.
 */
import { describe, it, expect } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { InternalMetadata } from "../internal-metadata.js";
import { canonicalSchemaStamp } from "./canonical-schema-stamp.js";
import { RUN_TOKEN_ENV } from "./run-token.js";
import { TEMPLATE_PATH_ENV, isSqliteRun } from "./sqlite-template.js";

const runToken = process.env[RUN_TOKEN_ENV];
const templatePath = process.env[TEMPLATE_PATH_ENV];
const sqliteActive = isSqliteRun() && !!templatePath;

describe.skipIf(!sqliteActive)("sqlite template stamp", () => {
  it("the template file is stamped with the canonical schema SHA1", async () => {
    const adapter = new BetterSQLite3Adapter(templatePath);
    try {
      const metadata = new InternalMetadata(adapter);
      expect(await metadata.get("schema_sha1"), "template must carry the stamped schema_sha1").toBe(
        canonicalSchemaStamp(runToken!),
      );
    } finally {
      await adapter.close();
    }
  });
});
