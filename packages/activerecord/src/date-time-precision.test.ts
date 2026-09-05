import { describe, expect, beforeEach, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterType } from "./test-adapter.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { fixtures } from "./test-fixtures.js";
import { itIfSupports } from "./support/supports.js";

function nsec(v: RubyTime): number {
  return v.nsec;
}

describe("DateTimePrecisionTest", () => {
  fixtures({}, { useTransactionalTests: false });
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = Base.connection;
  });
  afterEach(async () => {
    await adapter.dropTable("foos", { ifExists: true });
  });
  function makeFoo() {
    class Foo extends Base {
      static override tableName = "foos";
    }
    Foo.adapter = adapter;
    return Foo;
  }

  itIfSupports("datetime_with_precision", "datetime data type with precision", async () => {
    await adapter.createTable("foos", { force: true }, () => {});
    await adapter.addColumn("foos", "created_at", "datetime", { precision: 0 });
    await adapter.addColumn("foos", "updated_at", "datetime", { precision: 5 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["created_at"].precision).toBe(0);
    expect((Foo.columnsHash() as any)["updated_at"].precision).toBe(5);
  });

  itIfSupports(
    "datetime_with_precision",
    "datetime precision is truncated on assignment",
    async () => {
      await adapter.createTable("foos", { force: true }, () => {});
      await adapter.addColumn("foos", "created_at", "datetime", { precision: 0 });
      await adapter.addColumn("foos", "updated_at", "datetime", { precision: 6 });
      const Foo = makeFoo();
      await Foo.loadSchema();
      const time = Temporal.Instant.from("2000-01-01T12:00:00.123456789Z");
      const foo = new Foo({ created_at: time, updated_at: time });
      expect(nsec((foo as any).created_at)).toBe(0);
      expect(nsec((foo as any).updated_at)).toBe(123456000);
      await (foo as any).save();
      await (foo as any).reload();
      expect(nsec((foo as any).created_at)).toBe(0);
      expect(nsec((foo as any).updated_at)).toBe(123456000);
    },
  );

  itIfSupports.skipIf(adapterType === "mysql")(
    "datetime_with_precision",
    "no datetime precision isnt truncated on assignment",
    async () => {
      await adapter.createTable("foos", { force: true }, (t) => {
        t.datetime("happened_at");
      });
      const Foo = makeFoo();
      await Foo.loadSchema();
      expect((Foo.columnsHash() as any)["happened_at"].precision).toBe(6);
      const time = Temporal.Instant.from("2000-01-01T12:00:00.123456789Z");
      const foo = new Foo({ happened_at: time });
      expect(nsec((foo as any).happened_at)).toBe(123456000);
    },
  );

  itIfSupports("datetime_with_precision", "timestamps helper with custom precision", async () => {
    await adapter.createTable("foos", { force: true }, (t) => {
      t.timestamps({ precision: 4 });
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["created_at"].precision).toBe(4);
    expect((Foo.columnsHash() as any)["updated_at"].precision).toBe(4);
  });

  itIfSupports(
    "datetime_with_precision",
    "passing precision to datetime does not set limit",
    async () => {
      await adapter.createTable("foos", { force: true }, (t) => {
        t.timestamps({ precision: 4 });
      });
      const Foo = makeFoo();
      await Foo.loadSchema();
      expect((Foo.columnsHash() as any)["created_at"].limit).toBeNull();
      expect((Foo.columnsHash() as any)["updated_at"].limit).toBeNull();
    },
  );

  itIfSupports("datetime_with_precision", "invalid datetime precision raises error", async () => {
    await expect(
      adapter.createTable("foos", { force: true }, (t) => {
        t.timestamps({ precision: 7 });
      }),
    ).rejects.toThrow(ArgumentError);
  });

  itIfSupports(
    "datetime_with_precision",
    "formatting datetime according to precision",
    async () => {
      await adapter.createTable("foos", { force: true }, () => {});
      await adapter.addColumn("foos", "created_at", "datetime", { precision: 0 });
      await adapter.addColumn("foos", "updated_at", "datetime", { precision: 4 });
      const Foo = makeFoo();
      await Foo.loadSchema();

      const date = Temporal.Instant.from("2014-08-17T12:30:00.999999Z");
      await (Foo as any).create({ created_at: date, updated_at: date });

      const foo = await (Foo as any).findBy({ created_at: date });
      expect(foo).not.toBeNull();
      expect(await (Foo as any).where({ updated_at: date }).count()).toBe(1);

      expect(foo.created_at).toEqual(RubyTime.utc(2014, 8, 17, 12, 30, 0));
      expect(foo.updated_at).toEqual(RubyTime.utc(2014, 8, 17, 12, 30, 0, 999900));
      expect((foo.created_at as RubyTime).usec).toBe(0);
      expect((foo.updated_at as RubyTime).usec).toBe(999900);
    },
  );

  itIfSupports(
    "datetime_with_precision",
    "formatting datetime according to precision when time zone aware",
    () => {
      // BLOCKED: type — withTimezoneConfig helper exists (test-helper.ts) but
    },
  );

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "formatting datetime according to precision using timestamptz",
    () => {
      // BLOCKED: adapter-pg — postgres-only (with_postgresql_datetime_type(:timestamptz))
    },
  );

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "formatting datetime according to precision when time zone aware using timestamptz",
    () => {
      // BLOCKED: adapter-pg — postgres-only + TimeZoneAware extension
    },
  );

  itIfSupports("datetime_with_precision", "writing a blank attribute", async () => {
    await adapter.createTable("foos", { force: true }, (t) => {
      t.datetime("happened_at");
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const r1 = await (Foo as any).create({ happened_at: null });
    expect(r1.happened_at).toBeNull();
    const r2 = await (Foo as any).create({ happened_at: "" });
    expect(r2.happened_at).toBeNull();
  });

  itIfSupports("datetime_with_precision", "writing a date attribute", async () => {
    await adapter.createTable("foos", { force: true }, (t) => {
      t.datetime("happened_at");
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const date = Temporal.PlainDate.from("2001-02-03");
    const record = await (Foo as any).create({ happened_at: date });
    const reloaded = await (Foo as any).find(record.id);
    const happenedAt = (reloaded.happened_at as RubyTime).getutc();
    expect(
      Temporal.PlainDate.from({
        year: happenedAt.year,
        month: happenedAt.mon,
        day: happenedAt.mday,
      }).equals(date),
    ).toBe(true);
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "writing a blank attribute timestamptz",
    () => {
      // BLOCKED: adapter-pg — postgres-only (with_postgresql_datetime_type(:timestamptz))
    },
  );

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "writing a date attribute timestamptz",
    () => {
      // BLOCKED: adapter-pg — postgres-only
    },
  );

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "writing a time with zone attribute timestamptz",
    () => {
      // BLOCKED: adapter-pg — postgres-only
    },
  );

  itIfSupports(
    "datetime_with_precision",
    "schema dump with default precision is not dumped",
    async () => {
      await adapter.createTable("foos", { force: true }, (t) => {
        t.timestamps({ precision: 6 });
      });
      const output = await SchemaDumper.dumpTableSchema(adapter, "foos");
      expect(output).toMatch(/t\.datetime\("created_at",\s*\{[^}]*null:\s*false/);
      expect(output).not.toMatch(/precision/);
    },
  );

  itIfSupports(
    "datetime_with_precision",
    "schema dump with without precision has precision as nil",
    async () => {
      await adapter.createTable("foos", { force: true }, (t) => {
        t.timestamps({ precision: null });
      });
      const output = await SchemaDumper.dumpTableSchema(adapter, "foos");
      expect(output).toMatch(/t\.datetime\("created_at".*precision.*null/);
      expect(output).toMatch(/t\.datetime\("updated_at".*precision.*null/);
    },
  );

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "datetime precision with zero should be dumped",
    () => {
      // BLOCKED: adapter-pg — postgres-only test (current_adapter?(:PostgreSQLAdapter))
    },
  );
});
