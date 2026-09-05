import { describe, expect, beforeEach, afterEach } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { adapterType } from "./test-adapter.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { fixtures } from "./test-fixtures.js";
import { itIfSupports } from "./support/supports.js";
import { Rational } from "@blazetrails/ruby-compat";

function nsecTime(v: RubyTime): number {
  return v.nsec;
}

function timeNowChangeNsec(nsec: number): RubyTime {
  return RubyTime.at(new Rational(RubyTime.now().toI(), 1)).plus(new Rational(nsec, 1_000_000_000));
}

describe("TimePrecisionTest", () => {
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

  itIfSupports("datetime_with_precision", "time data type with precision", async () => {
    await adapter.createTable("foos", { force: true }, () => {});
    await adapter.addColumn("foos", "start", "time", { precision: 3 });
    await adapter.addColumn("foos", "finish", "time", { precision: 6 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["start"].precision).toBe(3);
    expect((Foo.columnsHash() as any)["finish"].precision).toBe(6);
  });

  itIfSupports("datetime_with_precision", "time precision is truncated on assignment", async () => {
    await adapter.createTable("foos", { force: true }, () => {});
    await adapter.addColumn("foos", "start", "time", { precision: 0 });
    await adapter.addColumn("foos", "finish", "time", { precision: 6 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const time = timeNowChangeNsec(123456789);
    const foo = new Foo({ start: time, finish: time });
    expect(nsecTime((foo as any).start)).toBe(0);
    expect(nsecTime((foo as any).finish)).toBe(123456000);
    await (foo as any).save();
    await (foo as any).reload();
    expect(nsecTime((foo as any).start)).toBe(0);
    expect(nsecTime((foo as any).finish)).toBe(123456000);
  });

  itIfSupports.skipIf(adapterType === "mysql")(
    "datetime_with_precision",
    "no time precision isnt truncated on assignment",
    async () => {
      await adapter.createTable("foos", { force: true }, () => {});
      await adapter.addColumn("foos", "start", "time");
      await adapter.addColumn("foos", "finish", "time", { precision: 6 });
      const Foo = makeFoo();
      await Foo.loadSchema();
      const time = timeNowChangeNsec(123);
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
      await adapter.createTable("foos", { force: true }, (t) => {
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
      adapter.createTable("foos", { force: true }, (t) => {
        t.time("start", { precision: 7 });
        t.time("finish", { precision: 7 });
      }),
    ).rejects.toThrow(ArgumentError);
  });

  itIfSupports("datetime_with_precision", "formatting time according to precision", () => {
    // BLOCKED: type — PlainTime WHERE-clause quoting needed + time.to_s Rails-format comparison
  });

  itIfSupports("datetime_with_precision", "schema dump includes time precision", async () => {
    await adapter.createTable("foos", { force: true }, (t) => {
      t.time("start", { precision: 4 });
      t.time("finish", { precision: 6 });
    });
    const output = await SchemaDumper.dumpTableSchema(adapter, "foos");
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
