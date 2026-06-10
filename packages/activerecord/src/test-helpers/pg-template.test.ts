/**
 * Phase 1 probe: confirms the PostgreSQL template-clone mechanism is active.
 *
 * globalSetup builds `<base>_template` once, stamps its `ar_internal_metadata`
 * with the canonical schema SHA1, then clones each advisory slot DB from it via
 * `CREATE DATABASE ... TEMPLATE`. The stamp is what makes every worker's
 * `reconstructFromSchema` take the fast TRUNCATE path (`schemaUpToDate`) instead
 * of a full purge+reload per test file.
 *
 * The probe targets the template DB itself (deterministic, slot-independent)
 * rather than the worker's variably-assigned slot DB.
 *
 * Skipped automatically on sqlite/MySQL runs (PG_TEST_URL not set).
 */
import { describe, it, expect } from "vitest";
import pg from "pg";
import { generateSchemaFile } from "./schema-file-generator.js";
import { schemaSha1 } from "../tasks/database-tasks.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { PG_TEMPLATE_ENV } from "./template-global-setup.js";

const pgActive = Boolean(process.env.PG_TEST_URL);

describe.skipIf(!pgActive)("PG template-clone (Phase 1 probe)", () => {
  it("globalSetup provisioned the PG template for this run", () => {
    expect(
      process.env[PG_TEMPLATE_ENV],
      `${PG_TEMPLATE_ENV} must be set by globalSetup`,
    ).toBeTruthy();
  });

  it("the template DB is stamped with the canonical schema SHA1", async () => {
    // The SHA1 workers compute from TEST_SCHEMA must equal the value
    // globalSetup stamped into the template — that match is exactly what
    // `schemaUpToDate` checks, so every slot cloned from this template skips
    // the per-file DDL and only TRUNCATEs.
    const schemaFile = await generateSchemaFile(TEST_SCHEMA, "postgres");
    const expectedSha1 = await schemaSha1(schemaFile);

    const templateDb = process.env[PG_TEMPLATE_ENV]!;
    const url = new URL(process.env.PG_TEST_URL!);
    url.pathname = `/${templateDb}`;

    const client = new pg.Client(url.toString());
    await client.connect();
    try {
      const res = await client.query<{ value: string }>(
        "SELECT value FROM ar_internal_metadata WHERE key = 'schema_sha1'",
      );
      expect(res.rows[0]?.value, "template must carry the stamped schema_sha1").toBe(expectedSha1);
    } finally {
      await client.end();
    }
  });
});
