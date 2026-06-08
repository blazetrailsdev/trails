/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/timestamp_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TimeWithZone } from "@blazetrails/activesupport";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import {
  describeIfPg,
  PostgreSQLAdapter,
  withPostgresqlDatetimeType,
  withNativeDatabaseTypeOverrides,
} from "./test-helper.js";
import { SchemaDumper } from "../../connection-adapters/abstract/schema-dumper.js";
import { DateTime as OidDateTime } from "../../connection-adapters/postgresql/oid/date-time.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { withTimezoneConfig } from "../../test-helper.js";
import { Base } from "../../index.js";

setupHandlerSuite();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
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
  });

  describe("PostgreSQLTimestampTest", () => {
    it("timestamp column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
      expect(col!.sqlType).toBe("timestamp without time zone");
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
      expect(col!.type).toBe("datetime");
      expect(col!.precision).toBe(3);
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

    it("datetime column", async () => {
      const cols = await adapter.columns("postgresql_timestamps");
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("datetime");
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
      expect(col!.precision).toBe(3);
    });

    it("datetime schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_timestamps");
      expect(output).toContain("postgresql_timestamps");
      expect(output).toMatch(/t\.datetime/);
    });

    it("timestamp with zone values with rails time zone support and no time zone set", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      await adapter.exec(
        `CREATE TABLE postgresql_timestamp_with_zones (id SERIAL PRIMARY KEY, "time" TIMESTAMP WITH TIME ZONE)`,
      );
      await adapter.execute(
        `INSERT INTO postgresql_timestamp_with_zones (id, "time") VALUES (1, '2010-01-01 10:00:00-1')`,
      );
      try {
        await withTimezoneConfig({ default: "utc", awareAttributes: true }, async () => {
          adapter.reconnect();
          class PostgresqlTimestampWithZone extends Base {
            static _tableName = "postgresql_timestamp_with_zones";
          }
          await PostgresqlTimestampWithZone.loadSchema();
          const record = (await (PostgresqlTimestampWithZone as any).find(1)) as {
            time: Temporal.Instant;
          };
          // time zone aware types defaults to [datetime, time] — timestamptz is
          // NOT included, so the value stays a plain instant (Rails: instance_of Time).
          expect(record.time).toBeInstanceOf(Temporal.Instant);
          expect(record.time.epochNanoseconds).toBe(
            Temporal.Instant.from("2010-01-01T11:00:00Z").epochNanoseconds,
          );
        });
      } finally {
        adapter.reconnect();
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      }
    });

    it("timestamp with zone values without rails time zone support", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      await adapter.exec(
        `CREATE TABLE postgresql_timestamp_with_zones (id SERIAL PRIMARY KEY, "time" TIMESTAMP WITH TIME ZONE)`,
      );
      await adapter.execute(
        `INSERT INTO postgresql_timestamp_with_zones (id, "time") VALUES (1, '2010-01-01 10:00:00-1')`,
      );
      try {
        await withTimezoneConfig({ default: "local", awareAttributes: false }, async () => {
          adapter.reconnect();
          // make sure to use a non-UTC time zone
          await adapter.execute(`SET time zone 'America/Jamaica'`);
          class PostgresqlTimestampWithZone extends Base {
            static _tableName = "postgresql_timestamp_with_zones";
          }
          await PostgresqlTimestampWithZone.loadSchema();
          const record = (await (PostgresqlTimestampWithZone as any).find(1)) as {
            time: Temporal.Instant;
          };
          expect(record.time).toBeInstanceOf(Temporal.Instant);
          expect(record.time.epochNanoseconds).toBe(
            Temporal.Instant.from("2010-01-01T11:00:00Z").epochNanoseconds,
          );
        });
      } finally {
        adapter.reconnect();
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      }
    });
  });

  describe("PostgreSQLTimestampWithAwareTypesTest", () => {
    it("timestamp with zone values with rails time zone support and time zone set", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      await adapter.exec(
        `CREATE TABLE postgresql_timestamp_with_zones (id SERIAL PRIMARY KEY, "time" TIMESTAMP WITH TIME ZONE)`,
      );
      await adapter.execute(
        `INSERT INTO postgresql_timestamp_with_zones (id, "time") VALUES (1, '2010-01-01 10:00:00-1')`,
      );
      try {
        await withTimezoneConfig(
          {
            default: "utc",
            awareAttributes: true,
            zone: "Pacific Time (US & Canada)",
            awareTypes: ["timestamptz", "datetime", "time"],
          },
          async () => {
            adapter.reconnect();
            class PostgresqlTimestampWithZone extends Base {
              static _tableName = "postgresql_timestamp_with_zones";
            }
            await PostgresqlTimestampWithZone.loadSchema();
            const record = (await (PostgresqlTimestampWithZone as any).find(1)) as {
              time: TimeWithZone;
            };
            // aware_types includes :timestamptz + a zone is set, so the timestamptz
            // column is wrapped in TimeWithZone (Rails: instance_of ActiveSupport::TimeWithZone).
            expect(record.time).toBeInstanceOf(TimeWithZone);
            expect(record.time.utc().epochNanoseconds).toBe(
              Temporal.Instant.from("2010-01-01T11:00:00Z").epochNanoseconds,
            );
          },
        );
      } finally {
        adapter.reconnect();
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      }
    });
  });

  describe("PostgreSQLTimestampWithTimeZoneTest", () => {
    it("timestamp with zone values with rails time zone support and timestamptz and no time zone set", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      await adapter.exec(
        `CREATE TABLE postgresql_timestamp_with_zones (id SERIAL PRIMARY KEY, "time" TIMESTAMP WITH TIME ZONE)`,
      );
      await adapter.execute(
        `INSERT INTO postgresql_timestamp_with_zones (id, "time") VALUES (1, '2010-01-01 10:00:00-1')`,
      );
      try {
        await withPostgresqlDatetimeType("timestamptz", async () => {
          await withTimezoneConfig(
            {
              default: "utc",
              awareAttributes: true,
              awareTypes: ["timestamptz", "datetime", "time"],
            },
            async () => {
              adapter.reconnect();
              class PostgresqlTimestampWithZone extends Base {
                static _tableName = "postgresql_timestamp_with_zones";
              }
              await PostgresqlTimestampWithZone.loadSchema();
              const record = (await (PostgresqlTimestampWithZone as any).find(1)) as {
                time: Temporal.Instant;
              };
              // aware_types includes :timestamptz but NO zone is set, so the
              // converter passes the value through unwrapped (Rails: instance_of Time).
              expect(record.time).toBeInstanceOf(Temporal.Instant);
              expect(record.time.epochNanoseconds).toBe(
                Temporal.Instant.from("2010-01-01T11:00:00Z").epochNanoseconds,
              );
            },
          );
        });
      } finally {
        adapter.reconnect();
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      }
    });
    it("timestamp with zone values with rails time zone support and timestamptz and time zone set", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      await adapter.exec(
        `CREATE TABLE postgresql_timestamp_with_zones (id SERIAL PRIMARY KEY, "time" TIMESTAMP WITH TIME ZONE)`,
      );
      await adapter.execute(
        `INSERT INTO postgresql_timestamp_with_zones (id, "time") VALUES (1, '2010-01-01 10:00:00-1')`,
      );
      try {
        await withPostgresqlDatetimeType("timestamptz", async () => {
          await withTimezoneConfig(
            {
              default: "utc",
              awareAttributes: true,
              zone: "Pacific Time (US & Canada)",
              awareTypes: ["timestamptz", "datetime", "time"],
            },
            async () => {
              adapter.reconnect();
              class PostgresqlTimestampWithZone extends Base {
                static _tableName = "postgresql_timestamp_with_zones";
              }
              await PostgresqlTimestampWithZone.loadSchema();
              const record = (await (PostgresqlTimestampWithZone as any).find(1)) as {
                time: TimeWithZone;
              };
              expect(record.time).toBeInstanceOf(TimeWithZone);
              expect(record.time.utc().epochNanoseconds).toBe(
                Temporal.Instant.from("2010-01-01T11:00:00Z").epochNanoseconds,
              );
            },
          );
        });
      } finally {
        adapter.reconnect();
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones`);
      }
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
      class Dev extends Base {
        static tableName = "ts_infinity_dev";
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
    it("save infinity and beyond", async () => {
      // Rails: Developer.create!(name:, updated_at: 1.0 / 0.0) → reads back +Infinity;
      // -1.0 / 0.0 → -Infinity. TS uses the DateInfinity / DateNegativeInfinity
      // sentinels (the timestamp OID round-trips them as "infinity" / "-infinity").
      class Dev extends Base {
        static tableName = "ts_infinity_dev";
      }
      await adapter.exec(`DROP TABLE IF EXISTS ts_infinity_dev`);
      await adapter.exec(
        `CREATE TABLE ts_infinity_dev (id serial primary key, name varchar, updated_at timestamp)`,
      );
      try {
        await Dev.loadSchema();
        const pos = (await (Dev as any).create({
          name: "aaron",
          updated_at: DateInfinity,
        })) as { updated_at: unknown };
        expect(pos.updated_at).toBe(DateInfinity);
        const neg = (await (Dev as any).create({
          name: "aaron",
          updated_at: DateNegativeInfinity,
        })) as { updated_at: unknown };
        expect(neg.updated_at).toBe(DateNegativeInfinity);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS ts_infinity_dev`);
      }
    });
    it("bc timestamp", async () => {
      // Rails: Time.new(0) - 1.week = Dec 25, ISO year -1 (2 BC)
      const oidType = new OidDateTime();
      const instant = oidType.castValue("0002-12-25 00:00:00 BC") as Temporal.Instant;
      expect(instant.toZonedDateTimeISO("UTC").year).toBe(-1);
      const serialized = oidType.serialize(instant) as string;
      expect(serialized).toBe("0002-12-25 00:00:00 BC");
      const rows = await adapter.execute(`SELECT '${serialized}'::timestamp AS val`);
      const roundTripped = rows[0].val as Temporal.Instant;
      expect(roundTripped).toBeInstanceOf(Temporal.Instant);
      expect(roundTripped.epochMilliseconds).toBe(instant.epochMilliseconds);
    });
    it("bc timestamp leap year", async () => {
      // Rails: Time.utc(-4, 2, 29) = Feb 29, ISO year -4 (5 BC)
      const oidType = new OidDateTime();
      const instant = oidType.castValue("0005-02-29 00:00:00 BC") as Temporal.Instant;
      expect(instant.toZonedDateTimeISO("UTC").year).toBe(-4);
      const serialized = oidType.serialize(instant) as string;
      expect(serialized).toBe("0005-02-29 00:00:00 BC");
      const rows = await adapter.execute(`SELECT '${serialized}'::timestamp AS val`);
      const roundTripped = rows[0].val as Temporal.Instant;
      expect(roundTripped).toBeInstanceOf(Temporal.Instant);
      expect(roundTripped.epochMilliseconds).toBe(instant.epochMilliseconds);
    });
    it("bc timestamp year zero", async () => {
      // Rails: Time.utc(0, 4, 7) = Apr 7, ISO year 0 (1 BC)
      const oidType = new OidDateTime();
      const instant = oidType.castValue("0001-04-07 00:00:00 BC") as Temporal.Instant;
      expect(instant.toZonedDateTimeISO("UTC").year).toBe(0);
      const serialized = oidType.serialize(instant) as string;
      expect(serialized).toBe("0001-04-07 00:00:00 BC");
      const rows = await adapter.execute(`SELECT '${serialized}'::timestamp AS val`);
      const roundTripped = rows[0].val as Temporal.Instant;
      expect(roundTripped).toBeInstanceOf(Temporal.Instant);
      expect(roundTripped.epochMilliseconds).toBe(instant.epochMilliseconds);
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
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        try {
          await adapter.exec(
            `CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`,
          );
          await adapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime");
          const rows = await adapter.execute(
            `SELECT data_type FROM information_schema.columns
             WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
          );
          expect(rows[0]?.data_type).toBe("timestamp with time zone");
        } finally {
          await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        }
      });
    });

    it("adds column as custom type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
      await adapter.exec(`DROP TYPE IF EXISTS custom_time_format`);
      try {
        await adapter.exec(`CREATE TYPE custom_time_format AS ENUM ('past', 'present', 'future')`);
        await adapter.exec(`CREATE TABLE postgresql_timestamp_with_zones (id serial primary key)`);
        await withNativeDatabaseTypeOverrides(
          { datetimes_as_enum: { name: "custom_time_format" } },
          () =>
            withPostgresqlDatetimeType("datetimes_as_enum", () =>
              adapter.addColumn("postgresql_timestamp_with_zones", "times", "datetime", {
                precision: null,
              }),
            ),
        );
        const rows = await adapter.execute(
          `SELECT data_type, udt_name FROM information_schema.columns
           WHERE table_name = 'postgresql_timestamp_with_zones' AND column_name = 'times'`,
        );
        expect(rows[0]?.data_type).toBe("USER-DEFINED");
        expect(rows[0]?.udt_name).toBe("custom_time_format");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS postgresql_timestamp_with_zones CASCADE`);
        await adapter.exec(`DROP TYPE IF EXISTS custom_time_format`);
      }
    });
  });
});
