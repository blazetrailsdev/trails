import { describe, it, expect, beforeEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { instantToS } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import type { DatabaseAdapter } from "./adapter.js";
import { createTestAdapter } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./schema-dumper.js";
import { defineSchema } from "./test-helpers/define-schema.js";

function nsec(v: Temporal.Instant): number {
  let ns = v.epochNanoseconds % 1_000_000_000n;
  if (ns < 0n) ns += 1_000_000_000n;
  return Number(ns);
}

// See time-precision.test.ts — placeholder schema; tests recreate `foos` per-test
// with the precision under test via `ctx.createTable("foos", { force: true }, ...)`.
async function freshAdapter(): Promise<DatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, { foos: { name: "string" } });
  return adapter;
}

describe("DateTimePrecisionTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = await freshAdapter();
    ctx = new MigrationContext(adapter);
  });
  function makeFoo() {
    class Foo extends Base {
      static override tableName = "foos";
    }
    Foo.adapter = adapter;
    return Foo;
  }

  it("datetime data type with precision", async () => {
    await ctx.createTable("foos", { force: true }, () => {});
    await ctx.addColumn("foos", "created_at", "datetime", { precision: 0 });
    await ctx.addColumn("foos", "updated_at", "datetime", { precision: 5 });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["created_at"].precision).toBe(0);
    expect((Foo.columnsHash() as any)["updated_at"].precision).toBe(5);
  });

  it("datetime precision is truncated on assignment", async () => {
    await ctx.createTable("foos", { force: true }, () => {});
    await ctx.addColumn("foos", "created_at", "datetime", { precision: 0 });
    await ctx.addColumn("foos", "updated_at", "datetime", { precision: 6 });
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
  });

  it("no datetime precision isnt truncated on assignment", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.datetime("happened_at");
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["happened_at"].precision).toBe(6);
    const time = Temporal.Instant.from("2000-01-01T12:00:00.123456789Z");
    const foo = new Foo({ happened_at: time });
    expect(nsec((foo as any).happened_at)).toBe(123456000);
  });

  it("timestamps helper with custom precision", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.timestamps({ precision: 4 });
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["created_at"].precision).toBe(4);
    expect((Foo.columnsHash() as any)["updated_at"].precision).toBe(4);
  });

  it("passing precision to datetime does not set limit", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.timestamps({ precision: 4 });
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    expect((Foo.columnsHash() as any)["created_at"].limit).toBeNull();
    expect((Foo.columnsHash() as any)["updated_at"].limit).toBeNull();
  });

  it("invalid datetime precision raises error", async () => {
    await expect(
      ctx.createTable("foos", { force: true }, (t) => {
        t.timestamps({ precision: 7 });
      }),
    ).rejects.toThrow(ArgumentError);
  });

  it("formatting datetime according to precision", async () => {
    await ctx.createTable("foos", { force: true }, () => {});
    await ctx.addColumn("foos", "created_at", "datetime", { precision: 0 });
    await ctx.addColumn("foos", "updated_at", "datetime", { precision: 4 });
    const Foo = makeFoo();
    await Foo.loadSchema();

    // 999999 microseconds = 999.999ms
    const date = Temporal.Instant.from("2014-08-17T12:30:00.999999Z");
    await (Foo as any).create({ created_at: date, updated_at: date });

    // find_by uses the column type to truncate the query value, matching stored precision-0 value
    const foo = await (Foo as any).findBy({ created_at: date });
    expect(foo).not.toBeNull();
    expect(await (Foo as any).where({ updated_at: date }).count()).toBe(1);

    expect(foo.created_at.epochNanoseconds / 1_000_000_000n).toBe(
      date.epochNanoseconds / 1_000_000_000n,
    );
    // Both match date.to_s format: "2014-08-17 12:30:00 UTC" (no sub-second in default format)
    expect(instantToS(foo.created_at)).toBe(instantToS(date));
    expect(instantToS(foo.updated_at)).toBe(instantToS(date));
    // precision 0 → microseconds truncated to 0
    const usecCreated = Number(foo.created_at.epochNanoseconds % 1_000_000_000n) / 1000;
    expect(usecCreated).toBe(0);
    // precision 4 → 999999 microseconds truncated to 4 decimal places = 999900
    const usecUpdated = Number(foo.updated_at.epochNanoseconds % 1_000_000_000n) / 1000;
    expect(usecUpdated).toBe(999900);
  });

  it("formatting datetime according to precision when time zone aware", () => {
    // BLOCKED: type — withTimezoneConfig helper exists (test-helper.ts) but
    // Base.timeZoneAwareAttributes is not yet wired; TimeZoneConverter.serialize
    // not implemented (no TZ shift on datetime write).
  });

  it("formatting datetime according to precision using timestamptz", () => {
    // BLOCKED: adapter-pg — postgres-only (with_postgresql_datetime_type(:timestamptz))
  });

  it("formatting datetime according to precision when time zone aware using timestamptz", () => {
    // BLOCKED: adapter-pg — postgres-only + TimeZoneAware extension
  });

  it("writing a blank attribute", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.datetime("happened_at");
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const r1 = await (Foo as any).create({ happened_at: null });
    expect((r1 as any).happened_at).toBeNull();
    const r2 = await (Foo as any).create({ happened_at: "" });
    expect((r2 as any).happened_at).toBeNull();
  });

  it("writing a date attribute", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.datetime("happened_at");
    });
    const Foo = makeFoo();
    await Foo.loadSchema();
    const date = Temporal.PlainDate.from("2001-02-03");
    const record = await (Foo as any).create({ happened_at: date });
    const reloaded = await (Foo as any).find(record.id);
    const pdt = (reloaded as any).happened_at.toZonedDateTimeISO("UTC").toPlainDate();
    expect(pdt.equals(date)).toBe(true);
  });

  it("writing a blank attribute timestamptz", () => {
    // BLOCKED: adapter-pg — postgres-only (with_postgresql_datetime_type(:timestamptz))
  });

  it("writing a date attribute timestamptz", () => {
    // BLOCKED: adapter-pg — postgres-only
  });

  it("writing a time with zone attribute timestamptz", () => {
    // BLOCKED: adapter-pg — postgres-only
  });

  it("schema dump with default precision is not dumped", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.timestamps({ precision: 6 });
    });
    const output = SchemaDumper.dump(ctx) as string;
    expect(output).toMatch(/t\.datetime\("created_at",\s*\{[^}]*null:\s*false/);
    expect(output).not.toMatch(/precision/);
  });

  it("schema dump with without precision has precision as nil", async () => {
    await ctx.createTable("foos", { force: true }, (t) => {
      t.timestamps({ precision: null });
    });
    const output = SchemaDumper.dump(ctx) as string;
    expect(output).toMatch(/t\.datetime\("created_at".*precision.*null/);
    expect(output).toMatch(/t\.datetime\("updated_at".*precision.*null/);
  });

  it("datetime precision with zero should be dumped", () => {
    // BLOCKED: adapter-pg — postgres-only test (current_adapter?(:PostgreSQLAdapter))
  });
});
