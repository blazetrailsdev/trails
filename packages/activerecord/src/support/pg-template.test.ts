/**
 * Phase 1 probe: confirms the PostgreSQL template-clone mechanism is active.
 *
 * globalSetup builds `<base>_template` once, stamps its `ar_internal_metadata`
 * with this run's canonical-schema token, then clones each advisory slot DB from it via
 * `CREATE DATABASE ... TEMPLATE`. The stamp is what makes every worker's
 * `canonicalSchemaUpToDate` report true for the worker that claims a slot, so
 * its boot takes the fast TRUNCATE path instead of a full purge+reload.
 *
 * The probe targets the template DB itself (deterministic, slot-independent)
 * rather than the worker's variably-assigned slot DB.
 *
 * Skipped automatically on sqlite/MySQL runs (ARCONN is not postgresql).
 */
import { describe, it, expect } from "vitest";
import pg from "pg";
import { canonicalSchemaStamp } from "./canonical-schema-stamp.js";
import { RUN_TOKEN_ENV } from "./run-token.js";
import { PG_TEMPLATE_ENV } from "./template-global-setup.js";
import { postgresSettings, settingsUrl, withDatabase } from "./config.js";
import { activeLane } from "./connection.js";

const pgActive = activeLane() === "postgres";

describe.skipIf(!pgActive)("PG template-clone (Phase 1 probe)", () => {
  it("globalSetup provisioned the PG template for this run", () => {
    expect(
      process.env[PG_TEMPLATE_ENV],
      `${PG_TEMPLATE_ENV} must be set by globalSetup`,
    ).toBeTruthy();
  });

  it("the template DB is stamped with the canonical schema SHA1", async () => {
    // The stamp workers derive from this run's token must equal the value
    // globalSetup wrote into the template — that match is exactly what
    // `canonicalSchemaUpToDate` checks, so every slot cloned from this template
    // skips the boot DDL and only TRUNCATEs.
    const expectedSha1 = canonicalSchemaStamp(process.env[RUN_TOKEN_ENV]!);

    const templateDb = process.env[PG_TEMPLATE_ENV]!;
    const url = settingsUrl("postgres", withDatabase(postgresSettings(), templateDb));

    const client = new pg.Client(url);
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
