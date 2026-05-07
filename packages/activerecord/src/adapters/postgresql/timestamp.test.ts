/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/timestamp_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
    await adapter.exec(`
      CREATE TABLE "postgresql_timestamps" (
        "id" SERIAL PRIMARY KEY,
        "created_at" timestamp without time zone,
        "updated_at" timestamp without time zone DEFAULT NOW(),
        "occurred_at" timestamp with time zone,
        "precise_at" timestamp(3) without time zone
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_timestamps"`);
    await adapter.close();
  });

  describe("PostgreSQLTimestampTest", () => {
    it("timestamp column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("timestamp without time zone");
    });

    it("timestamp default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col).toBeDefined();
      // Rails' Column#default is nil for expression defaults; the SQL
      // expression itself lives in #default_function (postgresql/column.rb).
      expect(col!.defaultFunction).toContain("now");
    });

    it("timestamp type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-06-15 14:30:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Temporal.Instant);
      expect((rows[0].val as Temporal.Instant).toZonedDateTimeISO("UTC").year).toBe(2023);
    });

    it("timestamp with time zone", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_timestamps" ("occurred_at") VALUES ('2023-06-15 14:30:00+00')`,
      );
      const rows = await adapter.execute(
        `SELECT "occurred_at" FROM "postgresql_timestamps" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].occurred_at).toBeInstanceOf(Temporal.Instant);
    });

    it("timestamp precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
      expect(col!.type).toContain("timestamp");
    });

    it("timestamp infinity", async () => {
      const rows = await adapter.execute("SELECT 'infinity'::timestamp AS val");
      expect(rows[0].val).toBeDefined();
    });

    it("timestamp before epoch", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '1969-12-31 23:59:59' AS val");
      expect(rows[0].val).toBeInstanceOf(Temporal.Instant);
      expect((rows[0].val as Temporal.Instant).toZonedDateTimeISO("UTC").year).toBe(1969);
    });

    it("timestamp schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime\s*\("created_at"/);
    });

    // Needs migration framework
    it.skip("timestamp migration", async () => {
      // BLOCKED: adapter-pg — migration framework not implemented
      // ROOT-CAUSE: Rails' ActiveRecord::Migration.new.add_column uses the migration
      // framework's create_table / add_column DSL. The TS adapter exposes addColumn()
      // directly, but the test checks that the migration framework routes through
      // the adapter's datetime_type setting. The passing "adds column as timestamp"
      // test below covers the addColumn() path directly; this test is redundant.
      // SCOPE: Migration framework wiring; not a timestamp-specific gap.
    });

    it("datetime column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toContain("timestamp");
    });

    it("datetime default", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "updated_at");
      expect(col!.defaultFunction).toBeTruthy();
    });

    it("datetime type cast", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 10:00:00' AS val");
      expect(rows[0].val).toBeInstanceOf(Temporal.Instant);
    });

    it("datetime precision", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "precise_at");
      expect(col).toBeDefined();
    });

    it("datetime schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime/);
    });

    // Needs Rails time zone support
    it.skip("timestamp with zone values with rails time zone support and no time zone set", () => {
      // BLOCKED: adapter-pg — timezone-aware type routing not implemented
      // ROOT-CAUSE: Rails' with_timezone_config helper (default: :utc, aware_attributes: true)
      // switches the OID type for timestamptz columns between OID::DateTime and
      // OID::TimestampWithTimeZone; our adapter has no equivalent runtime config switch.
      // connection-adapters/postgresql/oid/timestamp-with-time-zone.ts would need to be
      // wired to a per-connection `aware_attributes` flag. Also requires reconnect() semantics.
      // SCOPE: ~100 LOC across postgresql-adapter.ts + oid/timestamp-with-time-zone.ts; blocks 5 tests.
    });
    it.skip("timestamp with zone values without rails time zone support", () => {
      // BLOCKED: adapter-pg — timezone-aware type routing not implemented
      // ROOT-CAUSE: Same as above; additionally requires setting session-level PG timezone
      // ("SET time zone 'America/Jamaica'") and routing through the aware_attributes=false path.
      // SCOPE: Same as above.
    });
  });

  describe("PostgreSQLTimestampWithAwareTypesTest", () => {
    it.skip("timestamp with zone values with rails time zone support and time zone set", () => {
      // BLOCKED: adapter-pg — timezone-aware type routing not implemented
      // ROOT-CAUSE: Requires aware_types: [:timestamptz, :datetime, :time] routing +
      // zone: "Pacific Time (US & Canada)" config; the OID type for timestamptz would
      // need to wrap values in a zone-aware type (Rails' ActiveSupport::TimeWithZone analog).
      // No equivalent TimeWithZone class exists in the TS layer yet.
      // SCOPE: ~150 LOC new; blocks this test only.
    });
  });

  describe("PostgreSQLTimestampWithTimeZoneTest", () => {
    it.skip("timestamp with zone values with rails time zone support and timestamptz and no time zone set", () => {
      // BLOCKED: adapter-pg — with_postgresql_datetime_type(:timestamptz) not wired
      // ROOT-CAUSE: Rails' with_postgresql_datetime_type helper temporarily changes the
      // adapter-level datetime_type class attribute; our adapter has datetimeType static
      // but no mechanism to change it per-connection for the duration of a block.
      // SCOPE: ~30 LOC test helper + datetimeType scoping in postgresql-adapter.ts.
    });
    it.skip("timestamp with zone values with rails time zone support and timestamptz and time zone set", () => {
      // BLOCKED: adapter-pg — same as above; additionally requires TimeWithZone wrapping.
      // ROOT-CAUSE: Same as the two prior timezone tests combined.
      // SCOPE: Same as above.
    });
  });

  describe("PostgreSQLTimestampFixtureTest", () => {
    it.skip("group by date", () => {
      // BLOCKED: adapter-pg — fixture-based Topic model not available
      // ROOT-CAUSE: Rails' `fixtures :topics` loads YAML fixtures into the topics table;
      // the fixture loading infrastructure (FixtureSet, YAML parsing, transactional setup)
      // is not ported. Also requires Base.group() + count() wired to AR query interface.
      // SCOPE: fixture loading is a separate multi-PR effort.
    });
    it("load infinity and beyond", async () => {
      const { Base } = await import("../../index.js");
      class Dev extends Base {
        static tableName = "ts_infinity_dev";
        static {
          this.adapter = adapter;
        }
      }
      await adapter.exec(`DROP TABLE IF EXISTS ts_infinity_dev`);
      await adapter.exec(
        `CREATE TABLE ts_infinity_dev (id serial primary key, updated_at timestamp)`,
      );
      try {
        await adapter.execute(
          `INSERT INTO ts_infinity_dev (updated_at) VALUES ('infinity'::timestamp)`,
        );
        await adapter.execute(
          `INSERT INTO ts_infinity_dev (updated_at) VALUES ('-infinity'::timestamp)`,
        );
        await Dev.loadSchema();
        const records = await (Dev as any).all();
        const timestamps = records.map((r: any) => r.updated_at);
        expect(timestamps).toContain(DateInfinity);
        expect(timestamps).toContain(DateNegativeInfinity);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS ts_infinity_dev`);
      }
    });
    it.skip("save infinity and beyond", async () => {
      // BLOCKED: adapter-pg — type map OID lookup fails at schema reflection time
      // ROOT-CAUSE: loadSchema() → columns() loads OID 1114 (timestamp) as data value,
      // but loadAdditionalTypes is only triggered for result FIELD OIDs (e.g., OID 26 = oid).
      // So lookupCastTypeFromColumn(updated_at, oid=1114) falls back to ValueType.
      // ValueType.serialize(DateInfinity) = DateInfinity (Symbol). Arel's quote() calls
      // String(Symbol) = "Symbol(@blazetrails/activemodel:DateInfinity)" → PG error.
      // Fix needed: call adapter.loadAdditionalTypes() before schema reflection so OID→type
      // mappings are populated, OR make lookupCastTypeFromColumn fall back to sqlType-name
      // lookup when oid miss (i.e., try typeMap.lookup(normalizeFormatType(sqlType)) as
      // secondary key after OID miss). The fallback path already exists when oid==null;
      // extending it to oid-miss would fix timestamp, bytea, and all custom OID types.
      // SCOPE: ~5 LOC in postgresql-adapter.ts:lookupCastTypeFromColumn; unblocks save
      // infinity, BC timestamp tests, and bytea round-trip tests.
    });
    it.skip("bc timestamp", () => {
      // BLOCKED: adapter-pg — BC date serialize path not wired for PG BC format
      // ROOT-CAUSE: base DateTimeType.serialize calls Temporal.Instant.toString() which
      // outputs ISO 8601 with negative year (e.g. "-0043-01-01T00:00:00Z"). PostgreSQL's
      // timestamp parser does NOT accept ISO 8601 negative years natively; it expects the
      // "YYYY-MM-DD BC" proleptic Gregorian format. A custom serialize override in
      // OID::DateTime is needed to convert negative Temporal years to the PG BC suffix format.
      // SCOPE: ~20 LOC in connection-adapters/postgresql/oid/date-time.ts serialize override;
      // unblocks all 3 bc timestamp tests.
    });
    it.skip("bc timestamp leap year", () => {
      // BLOCKED: adapter-pg — same BC date serialize gap as "bc timestamp".
      // ROOT-CAUSE: Temporal.Instant.toString() → ISO negative year not accepted by PG;
      // needs serialize override in OID::DateTime to emit "YYYY-MM-DD BC" format.
      // SCOPE: Same fix as "bc timestamp".
    });
    it.skip("bc timestamp year zero", () => {
      // BLOCKED: adapter-pg — same BC date serialize gap as "bc timestamp".
      // ROOT-CAUSE: Year 0 in ISO 8601 = 1 BCE in PG proleptic Gregorian; same serialize
      // mismatch applies. After the serialize fix, also verify that PG "0001 BC" round-trips
      // correctly through parseBcTimestampAsInstant (bcYearToIso converts 1 → 0).
      // SCOPE: Same fix as "bc timestamp"; add year-zero edge case to the serialize helper.
    });
  });

  describe("PostgreSQLTimestampMigrationTest", () => {
    it("adds column as timestamp", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
      try {
        await adapter.exec(`CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`);
        await adapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime");
        const rows = await adapter.execute(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
        );
        expect(rows[0]?.data_type).toBe("timestamp without time zone");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
      }
    });

    it("adds column as timestamptz if datetime type changed", async () => {
      class TimestamptzAdapter extends PostgreSQLAdapter {
        static override datetimeType: "timestamp" | "timestamptz" = "timestamptz";
      }
      const tzAdapter = new TimestamptzAdapter(PG_TEST_URL);
      try {
        await tzAdapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        await tzAdapter.exec(
          `CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`,
        );
        await tzAdapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime");
        const rows = await tzAdapter.execute(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
        );
        expect(rows[0]?.data_type).toBe("timestamp with time zone");
      } finally {
        await tzAdapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        await tzAdapter.close();
      }
    });

    it.skip("adds column as custom type", async () => {
      // BLOCKED: adapter-pg — NATIVE_DATABASE_TYPES is not extensible at runtime
      // ROOT-CAUSE: Rails patches NATIVE_DATABASE_TYPES[:datetimes_as_enum] to point at a
      // custom enum type, then with_postgresql_datetime_type(:datetimes_as_enum) makes the
      // adapter use it for datetime columns. Our adapter's nativeDatabaseTypes is a static
      // object and datetimeType only accepts "timestamp" | "timestamptz" (a string literal
      // union), not arbitrary custom type keys.
      // SCOPE: ~30 LOC — widen datetimeType to string, allow nativeDatabaseTypes override;
      // low priority since this is a niche extensibility path.
    });
  });
});
