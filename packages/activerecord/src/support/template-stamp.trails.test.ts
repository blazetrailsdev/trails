import { describe, it, expect } from "vitest";
import "../sqlite/better-sqlite3.js";
import { Base } from "../base.js";
import { bootOutcome } from "./boot-outcome.js";
import { InternalMetadata } from "../internal-metadata.js";
import { newSqlitePool } from "./pooled-sqlite-adapter.js";
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
    const pool = newSqlitePool(templatePath);
    try {
      const metadata = new InternalMetadata(pool);
      expect(await metadata.get("schema_sha1"), "template must carry the stamped schema_sha1").toBe(
        canonicalSchemaStamp(runToken),
      );
    } finally {
      await pool.disconnectBang();
    }
  });
});

describe.skipIf(!runToken)("boot fast path stamp", () => {
  it("leaves the database stamped for the next worker recycled onto it", async () => {
    const connection = await Base.leaseConnection();
    await resetTestTables(connection);
    expect(await canonicalSchemaUpToDate(connection)).toBe(false);

    await loadAdapterSpecificSchema(connection);
    await stampCanonicalSchema(connection);
    expect(await canonicalSchemaUpToDate(await Base.leaseConnection())).toBe(true);
  });
});

describe.skipIf(!runToken)("adapter-specific tables snapshot", () => {
  it("records the carried-forward set, not what the live database happens to hold", async () => {
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

describe.skipIf(!runToken)("snapshot value width", () => {
  it("round-trips a snapshot far wider than the value column", async () => {
    const connection = await Base.leaseConnection();
    const before = await adapterSpecificTables(connection);
    const oversized = Array.from({ length: 200 }, (_, i) => `padding_table_${i}`);
    try {
      await stampCanonicalSchema(connection, undefined, oversized);
      expect(await adapterSpecificTables(connection)).toEqual(oversized.slice().sort());
    } finally {
      await stampCanonicalSchema(connection, undefined, before ?? undefined);
    }
  });

  it("a shrinking snapshot does not read back the chunks it no longer uses", async () => {
    const connection = await Base.leaseConnection();
    const before = await adapterSpecificTables(connection);
    try {
      await stampCanonicalSchema(
        connection,
        undefined,
        Array.from({ length: 200 }, (_, i) => `padding_table_${i}`),
      );
      await stampCanonicalSchema(connection, undefined, ["defaults"]);
      expect(await adapterSpecificTables(connection)).toEqual(["defaults"]);
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
