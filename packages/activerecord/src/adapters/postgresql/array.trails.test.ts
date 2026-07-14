/**
 * Trails-only PG array coverage with no counterpart in Rails'
 * activerecord/test/cases/adapters/postgresql/array_test.rb — kept out of the
 * mirror file so `test:compare` name-matching isn't polluted.
 */
import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import { Base } from "../../index.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// pg_arrays uses PG array columns not expressible via createTable's typed
// builder, so it is created via raw DDL (mirroring the Rails array_test setup).
fixtures([]);

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await adapter.exec(`DROP TABLE IF EXISTS pg_arrays`);
    await adapter.exec(`
      CREATE TABLE pg_arrays (
        id serial primary key,
        datetimes timestamp(6)[]
      )
    `);
    await adapter.loadAdditionalTypes();
  });
  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS pg_arrays`).catch(() => {});
  });

  it("inlines a proleptic-year datetime[] element as a quoted_date BC literal", async () => {
    // Regression guard for the inline INSERT path (base.ts create → adapter
    // `quote` → encode_array → type_cast → quoted_date). A proleptic year <= 0
    // only round-trips through the " BC" literal; the pre-fix ISO fallthrough
    // (`{-000042-03-15T...Z}`) is not valid PG array input, so this pins the
    // routing rather than a form PG happens to also accept (ISO datetimes do).
    class PgArrays extends Base {
      static tableName = "pg_arrays";
      declare datetimes: Temporal.Instant[];
      static {
        this.attribute("id", "integer");
      }
    }
    await PgArrays.loadSchema();
    // Temporal proleptic year -42 == 43 BC.
    const bc = Temporal.Instant.from("-000042-03-15T12:34:56.123456Z");
    const record = await PgArrays.create({ datetimes: [bc] });
    await record.reload();
    expect(record.datetimes).toHaveLength(1);
    expect(record.datetimes[0].epochNanoseconds).toBe(bc.epochNanoseconds);
  });
});
