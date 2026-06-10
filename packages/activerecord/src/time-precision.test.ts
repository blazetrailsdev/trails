import { describe, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import type { DatabaseAdapter } from "./adapter.js";
import { createTestAdapter, adapterType } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./schema-dumper.js";
import { itIfSupports } from "./test-helpers/supports.js";

function nsecTime(v: Temporal.PlainTime): number {
  return v.millisecond * 1_000_000 + v.microsecond * 1_000 + v.nanosecond;
}

describe("TimePrecisionTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  // Rails: `foos` is not a schema.rb fixture table — each test builds it with
  // `create_table(:foos, force: true)` for the precision under test and the
  // `teardown` drops it (`drop_table :foos, if_exists: true`). Mirror that
  // here rather than seeding a placeholder into the canonical schema.
  beforeEach(() => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
  });
  afterEach(async () => {
    await ctx.dropTable("foos", { ifExists: true });
  });
  function makeFoo() {
    class Foo extends Base {
      static override tableName = "foos";
    }
    Foo.adapter = adapter;
    return Foo;
  }

  itIfSupports("datetime_with_precision", "time data type with precision", async () => {
    await ctx.createTable("foos", { force: true }, () => {});
    await ctx.addColumn("foos", "start", "time", { precision: 3 });
    await ctx.addColumn("foos", "finish", "time", { precision: 6 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["start"].precision).toBe(3);
    expect((Foo.columnsHash() as any)["finish"].precision).toBe(6);
  });

  itIfSupports("datetime_with_precision", "time precision is truncated on assignment", async () => {
    await ctx.createTable("foos", { force: true }, () => {});
    await ctx.addColumn("foos", "start", "time", { precision: 0 });
    await ctx.addColumn("foos", "finish", "time", { precision: 6 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const time = Temporal.PlainTime.from({
      hour: 12,
      minute: 0,
      second: 0,
      millisecond: 123,
      microsecond: 456,
      nanosecond: 789,
    });
    const foo = new Foo({ start: time, finish: time });
    expect(nsecTime((foo as any).start)).toBe(0);
    expect(nsecTime((foo as any).finish)).toBe(123456000);
    await (foo as any).save();
    await (foo as any).reload();
    expect(nsecTime((foo as any).start)).toBe(0);
    expect(nsecTime((foo as any).finish)).toBe(123456000);
  });

  // Rails skips this on Mysql2Adapter: a `TIME` column without
  // explicit precision is `TIME(0)` on MySQL/MariaDB, so the assignment does
  // truncate. See vendor/rails/activerecord/test/cases/time_precision_test.rb.
  itIfSupports.skipIf(adapterType === "mysql")(
    "datetime_with_precision",
    "no time precision isnt truncated on assignment",
    async () => {
      await ctx.createTable("foos", { force: true }, () => {});
      await ctx.addColumn("foos", "start", "time");
      await ctx.addColumn("foos", "finish", "time", { precision: 6 });
      const Foo = makeFoo();
      await Foo.loadSchema();
      const time = Temporal.PlainTime.from({
        hour: 12,
        minute: 0,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 123,
      });
      const foo = new Foo({ start: time, finish: time });
      expect(nsecTime((foo as any).start)).toBe(123);
      expect(nsecTime((foo as any).finish)).toBe(0);
      await (foo as any).save();
      await (foo as any).reload();
      expect(nsecTime((foo as any).start)).toBe(0);
      expect(nsecTime((foo as any).finish)).toBe(0);
    },
  );

  itIfSupports(
    "datetime_with_precision",
    "passing precision to time does not set limit",
    async () => {
      await ctx.createTable("foos", { force: true }, (t) => {
        t.time("start", { precision: 3 });
        t.time("finish", { precision: 6 });
      });
      const Foo = makeFoo();
      await Foo.loadSchema();
      expect((Foo.columnsHash() as any)["start"].limit).toBeNull();
      expect((Foo.columnsHash() as any)["finish"].limit).toBeNull();
    },
  );

  itIfSupports("datetime_with_precision", "invalid time precision raises error", async () => {
    await expect(
      ctx.createTable("foos", { force: true }, (t) => {
        t.time("start", { precision: 7 });
        t.time("finish", { precision: 7 });
      }),
    ).rejects.toThrow(ArgumentError);
  });

  itIfSupports("datetime_with_precision", "formatting time according to precision", () => {
    // BLOCKED: type — PlainTime WHERE-clause quoting needed + time.to_s Rails-format comparison
    // ROOT-CAUSE: ~20 LOC in connection-adapters/abstract/quoting.ts PlainTime quoting
  });

  itIfSupports("datetime_with_precision", "schema dump includes time precision", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.time("start", { precision: 4 });
      t.time("finish", { precision: 6 });
    });
    const output = SchemaDumper.dump(ctx) as string;
    expect(output).toMatch(/t\.time\("start",\s*\{[^}]*precision:\s*4/);
    expect(output).toMatch(/t\.time\("finish",\s*\{[^}]*precision:\s*6/);
  });

  itIfSupports.skipIf(adapterType !== "postgres")(
    "datetime_with_precision",
    "time precision with zero should be dumped",
    () => {
      // BLOCKED: adapter-pg — postgres-only test (current_adapter?(:PostgreSQLAdapter))
    },
  );
});
