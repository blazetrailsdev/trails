/**
 * The sqlite/MySQL companion to `pg-template.test.ts`: the canonical-schema
 * stamp is what puts a booting worker on `test-setup-dy.ts`'s TRUNCATE fast
 * path instead of a purge + full canonical reload, so both ends of it are
 * pinned here — globalSetup laying it, and the fast path leaving it behind.
 *
 * The first probe is lane-specific because only sqlite has a stamped artifact a
 * test can read back: its template file is cloned per worker and never booted
 * onto, so it keeps its stamp for the whole run. PG's equivalent (the template
 * DB) is covered by `pg-template.test.ts`. MySQL has no `CREATE DATABASE ...
 * TEMPLATE` primitive, so globalSetup stamps the slot DBs workers boot onto
 * directly, and the first boot consumes the stamp — nothing survives to assert.
 *
 * The second probe covers every lane, MySQL included, by replaying the fast
 * path's arm against the worker's own database.
 */
import { describe, it, expect } from "vitest";
import "../sqlite/better-sqlite3.js";
import { Base } from "../base.js";
import { bootOutcome } from "./boot-outcome.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { InternalMetadata } from "../internal-metadata.js";
import {
  canonicalSchemaStamp,
  canonicalSchemaUpToDate,
  adapterSpecificTables,
  stampCanonicalSchema,
} from "./canonical-schema-stamp.js";
import { resetTestTables } from "./drop-all-tables.js";
import { loadAdapterSpecificSchema } from "./load-schema-helper.js";
import { RUN_TOKEN_ENV } from "./run-token.js";
import { TEMPLATE_PATH_ENV, isSqliteRun } from "./sqlite-template.js";

const runToken = process.env[RUN_TOKEN_ENV] ?? "";
const templatePath = process.env[TEMPLATE_PATH_ENV] ?? "";
const sqliteActive = isSqliteRun() && !!templatePath && !!runToken;

describe.skipIf(!sqliteActive)("sqlite template stamp", () => {
  it("the template file is stamped with the canonical schema SHA1", async () => {
    const adapter = new BetterSQLite3Adapter(templatePath);
    try {
      const metadata = new InternalMetadata(adapter);
      expect(await metadata.get("schema_sha1"), "template must carry the stamped schema_sha1").toBe(
        canonicalSchemaStamp(runToken),
      );
    } finally {
      await adapter.close();
    }
  });
});

describe.skipIf(!runToken)("boot fast path stamp", () => {
  it("leaves the database stamped for the next worker recycled onto it", async () => {
    // Replays `test-setup-dy.ts`'s fast-path arm verbatim. `resetTestTables`
    // drops `ar_internal_metadata` along with the other bookkeeping tables, so
    // without the re-stamp that arm ends with, the stamp is single-use per
    // database and every recycled worker pays the full purge+reload. Running
    // the arm here is safe: it is the same reset the suite runs at worker boot,
    // and it re-lays the adapter-specific tables it drops.
    const connection = await Base.leaseConnection();
    await resetTestTables(connection);
    // The hazard the re-stamp answers, asserted rather than assumed: the reset
    // takes the stamp with it, so the arm is not self-sustaining without it.
    expect(await canonicalSchemaUpToDate(connection)).toBe(false);

    await loadAdapterSpecificSchema(connection);
    await stampCanonicalSchema(connection);
    expect(await canonicalSchemaUpToDate(await Base.leaseConnection())).toBe(true);
  });
});

describe.skipIf(!runToken)("adapter-specific tables snapshot", () => {
  it("records the carried-forward set, not what the live database happens to hold", async () => {
    // The fast path skips the adapter-specific arm when the snapshot is intact,
    // so the snapshot must not shrink to whatever a test file left behind. A
    // re-stamp that took a fresh snapshot here would drop `defaults` from the
    // recorded set for every later file, with nothing left to re-lay it.
    const connection = await Base.leaseConnection();
    const before = await adapterSpecificTables(connection);
    expect(before, "boot must have recorded a snapshot").not.toBeNull();
    expect(before).toContain("defaults");

    await connection.dropTable("defaults", { ifExists: true });
    try {
      await stampCanonicalSchema(connection, undefined, before!);
      expect(await adapterSpecificTables(connection)).toContain("defaults");
    } finally {
      await loadAdapterSpecificSchema(connection);
      await stampCanonicalSchema(connection, undefined, before!);
    }
  });
});

describe.skipIf(!runToken)("snapshot width backstop", () => {
  it("survives a snapshot wider than the value column", async () => {
    // `ar_internal_metadata.value` is `t.string` (internal_metadata.rb:85-93),
    // which MySQL alone renders `varchar(255)` (abstract_mysql_adapter.rb:33);
    // PG and SQLite impose no limit (postgresql_adapter.rb:136,
    // sqlite3_adapter.rb:71). Widening the column would diverge from Rails, so
    // MySQL degrades to a re-lay instead — and must not raise ValueTooLong.
    const connection = await Base.leaseConnection();
    const before = await adapterSpecificTables(connection);
    const oversized = Array.from({ length: 200 }, (_, i) => `padding_table_${i}`);
    try {
      await stampCanonicalSchema(connection, undefined, oversized);
      const stored = await adapterSpecificTables(connection);
      if (connection.adapterName === "mysql") {
        expect(stored).toBeNull();
      } else {
        expect(stored).toEqual(oversized.slice().sort());
      }
    } finally {
      await stampCanonicalSchema(connection, undefined, before ?? undefined);
    }
  });
});

describe.skipIf(!runToken)("boot outcome", () => {
  it("a boot that took the fast path leaves the database stamped", () => {
    const outcome = bootOutcome();
    expect(outcome, "boot must record which arm it took").not.toBeNull();
    expect(outcome?.stamped, `boot arm ${outcome?.arm} must leave the database stamped`).toBe(true);
  });
});
