import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import { toI } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import type { FunctionProxy } from "../lib/database.js";
import { engine } from "../lib/engine/better-sqlite3.js";

class AggregateHandler {
  static get arity(): number {
    return 1;
  }

  static get textRep(): number {
    return SQLite3.Constants.TextRep.ANY;
  }

  static {
    Object.defineProperty(this, "name", { value: "multiply" });
  }

  step(ctx: FunctionProxy, a: unknown): void {
    ctx.set("buffer", ctx.get("buffer") ?? 1);
    ctx.set("buffer", (ctx.get("buffer") as number) * Number(toI(a)));
  }

  finalize(ctx: FunctionProxy): void {
    ctx.result = ctx.get("buffer");
  }
}

describe("IntegrationAggregateTestCase", () => {
  let db: InstanceType<typeof SQLite3.Database>;

  beforeEach(async () => {
    db = new SQLite3.Database(":memory:", { engine });
    await db.transaction(null, async () => {
      await db.execute("create table foo ( a integer primary key, b text, c integer )");
      await db.execute("insert into foo ( b, c ) values ( 'foo', 10 )");
      await db.execute("insert into foo ( b, c ) values ( 'bar', 11 )");
      await db.execute("insert into foo ( b, c ) values ( 'bar', 12 )");
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const accumulate = (ctx: FunctionProxy, a: unknown) => {
    ctx.set("sum", ctx.get("sum") ?? 0);
    ctx.set("sum", (ctx.get("sum") as number) + Number(toI(a)));
  };

  it("create aggregate without block", async () => {
    const step = accumulate;

    const final = (ctx: FunctionProxy) => {
      ctx.result = ctx.get("sum");
    };

    db.createAggregate("accumulate", 1, step, final);

    let value = await db.getFirstValue("select accumulate(a) from foo");
    expect(value).toBe(6);

    value = await db.getFirstValue("select accumulate(a) from foo");
    expect(value).toBe(6);
  });

  it("create aggregate with block", async () => {
    db.createAggregate("accumulate", 1, undefined, undefined, undefined, function () {
      this.step(accumulate);

      this.finalize((ctx) => {
        ctx.result = ctx.get("sum");
      });
    });

    const value = await db.getFirstValue("select accumulate(a) from foo");
    expect(value).toBe(6);
  });

  it("create aggregate with group by", async () => {
    db.createAggregate("accumulate", 1, undefined, undefined, undefined, function () {
      this.step(accumulate);

      this.finalize((ctx) => {
        ctx.result = ctx.get("sum");
      });
    });

    const values = (await db.execute(
      "select b, accumulate(c) from foo group by b order by b",
    )) as unknown[][];
    expect(values[0][0]).toBe("bar");
    expect(values[0][1]).toBe(23);
    expect(values[1][0]).toBe("foo");
    expect(values[1][1]).toBe(10);
  });

  it("create aggregate with no data", async () => {
    db.createAggregate("accumulate", 1, undefined, undefined, undefined, function () {
      this.step(accumulate);

      this.finalize((ctx) => {
        ctx.result = ctx.get("sum") ?? 0;
      });
    });

    const value = await db.getFirstValue("select accumulate(a) from foo where a = 100");
    expect(value).toBe(0);
  });

  it("create aggregate handler", async () => {
    db.createAggregateHandler(AggregateHandler);
    const value = await db.getFirstValue("select multiply(a) from foo");
    expect(value).toBe(6);
  });
});
