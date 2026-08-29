import { describe, it, expect } from "vitest";
import { Base, ExplainRegistry, registerModel } from "./index.js";
import { buildExplainClause, renderBind } from "./explain.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { rubyInspect } from "./relation/ruby-inspect.js";
import { ValueType } from "@blazetrails/activemodel";
import { itIfSupports } from "./support/supports.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { captureSql } from "./testing/sql-capture.js";
import { fixtures } from "./test-fixtures.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb } from "./test-helpers/models/bulb.js";

registerModel(Car);
registerModel(Bulb);

describe("ExplainTest", () => {
  fixtures(["cars", "bulbs"]);

  itIfSupports("explain", "relation explain", async () => {
    const message = await Car.where({ name: "honda" }).explain().inspect();
    expect(message).toMatch(/^EXPLAIN/m);
  });

  itIfSupports("explain", "collecting queries for explain", async () => {
    const { queries } = await Base.collectingQueriesForExplain(async () => {
      await Car.where({ name: "honda" });
    });

    const [sql, binds] = queries[0];
    expect(sql).toContain("SELECT");
    if (binds.length > 0) {
      expect(binds.length).toBe(1);
      expect((binds[binds.length - 1] as { value: unknown }).value).toBe("honda");
    } else {
      expect(sql).toContain("honda");
    }
  });

  itIfSupports("explain", "relation explain with average", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.average("id");
      })
    )[0];
    const message = await Car.all().explain().average("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with count", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.count();
      })
    )[0];
    const message = await Car.all().explain().count();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with count and argument", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await (Car as any).count("id");
      })
    )[0];
    const message = await (Car.all().explain() as any).count("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with minimum", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.minimum("id");
      })
    )[0];
    const message = await Car.all().explain().minimum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with maximum", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.maximum("id");
      })
    )[0];
    const message = await Car.all().explain().maximum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with sum", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.sum("id");
      })
    )[0];
    const message = await Car.all().explain().sum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with first", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.all().first();
      })
    )[0].replace(/LIMIT[\s\S]*/, "");
    const message = await Car.all().explain().first();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with last", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.all().last();
      })
    )[0].replace(/LIMIT[\s\S]*/, "");
    const message = await Car.all().explain().last();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with pluck", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.all().pluck();
      })
    )[0];
    const message = await Car.all().explain().pluck();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "relation explain with pluck with args", async () => {
    const expectedQuery = (
      await captureSql(async () => {
        await Car.all().pluck("id", "name");
      })
    )[0];
    const message = await Car.all().explain().pluck("id", "name");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toContain(expectedQuery);
  });

  itIfSupports("explain", "exec explain with no binds", async () => {
    const sqls = ["foo", "bar"];
    const queries: [string, unknown[]][] = [
      [sqls[0], []],
      [sqls[1], []],
    ];
    const adapter = Base.connection as unknown as {
      explain: (...args: unknown[]) => Promise<string>;
    };
    const original = adapter.explain;
    let called = 0;
    adapter.explain = async () => `query plan ${sqls[called++]}`;
    try {
      const clause = await buildExplainClause(adapter);
      const expected = sqls.map((sql) => `${clause} ${sql}\nquery plan ${sql}`).join("\n");
      expect(await Base.execExplain(queries)).toBe(expected);
    } finally {
      adapter.explain = original;
    }
  });

  itIfSupports("explain", "exec explain with binds", async () => {
    const sqls = ["foo", "bar"];
    const queries: [string, unknown[]][] = [
      [sqls[0], [bindParam("wadus", 1)]],
      [sqls[1], [bindParam("chaflan", 2)]],
    ];
    const adapter = Base.connection as unknown as {
      explain: (...args: unknown[]) => Promise<string>;
    };
    const original = adapter.explain;
    let called = 0;
    adapter.explain = async () => `query plan ${sqls[called++]}`;
    try {
      const clause = await buildExplainClause(adapter);
      const expected = [
        `${clause} ${sqls[0]} [["wadus", 1]]\nquery plan ${sqls[0]}`,
        `${clause} ${sqls[1]} [["chaflan", 2]]\nquery plan ${sqls[1]}`,
      ].join("\n");
      expect(await Base.execExplain(queries)).toBe(expected);
    } finally {
      adapter.explain = original;
    }
  });

  it("explain returns query plan string (Rails-guided)", async () => {
    const plan = await Car.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("prints one EXPLAIN block per collected query with the header prefix", async () => {
    const plan = await Car.where({ name: "honda" }).explain();
    expect(plan).toMatch(/^EXPLAIN\b/m);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("captures queries for eager-loaded associations, one block per query", async () => {
    const plan = await Car.all().preload(":bulbs").explain();
    const blocks = plan.split(/^(?=EXPLAIN)/m).filter((b) => /EXPLAIN/.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan.toLowerCase()).toContain("cars");
    expect(plan.toLowerCase()).toContain("bulbs");
  });

  it("resets ExplainRegistry after the call (no leaked collection state)", async () => {
    await Car.all().explain();
    expect(ExplainRegistry.collect).toBe(false);
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("does not load the relation as a side effect", async () => {
    const relation = Car.where({ name: "honda" });
    await relation.explain();
    expect(relation.isLoaded).toBe(false);
  });

  it("yields empty output for a query-less relation", async () => {
    const plan = await Car.none().explain();
    expect(plan).toBe("");
  });

  it("yields empty output for a contradiction relation", async () => {
    const plan = await Car.where({ id: [] }).explain();
    expect(plan).toBe("");
  });

  it("renders binds via adapter.typeCast + Ruby-inspect form", async () => {
    const rendered = rubyInspect(
      [BigInt(42), "str", 7, null, true, false].map((b) => renderBind(Base.connection, b)),
    );
    expect(rendered.startsWith('[[nil, 42], [nil, "str"], [nil, 7], [nil, nil], ')).toBe(true);
    expect(rendered).toMatch(/\[nil, (1\], \[nil, 0|true\], \[nil, false)\]\]$/);
    const plan = await Car.all().explain();
    expect(plan.length).toBeGreaterThan(0);
  });

  it("normalizes Date binds — invalid Dates render as 'Invalid Date'", () => {
    const stub = { typeCast: (v: unknown) => v } as unknown as DatabaseAdapter;
    expect(renderBind(stub, new Date("2026-04-15T12:00:00.000Z"))[1]).toBe(
      "2026-04-15T12:00:00.000Z",
    );
    expect(renderBind(stub, new Date(NaN))[1]).toBe("Invalid Date");
  });

  it("renders binary binds as '<N bytes of binary data>' (Rails parity)", async () => {
    const stub = { typeCast: (v: unknown) => v } as unknown as DatabaseAdapter;
    const buf = Buffer.from("hello world");
    const u8 = new Uint8Array([1, 2, 3, 4, 5]);
    const rendered = rubyInspect([buf, u8].map((b) => renderBind(stub, b)));
    expect(rendered).toBe(
      '[[nil, "<11 bytes of binary data>"], [nil, "<5 bytes of binary data>"]]',
    );
  });

  it("unwraps PG-style { value, format } bind shapes when rendering", async () => {
    const stub = {
      typeCast: (v: unknown) => v,
    } as unknown as DatabaseAdapter;
    const rendered = rubyInspect(
      [
        { value: "raw", format: 1 },
        { value: 42, format: 0 },
      ].map((b) => renderBind(stub, b)),
    );
    expect(rendered).toBe('[[nil, "raw"], [nil, 42]]');
  });

  it("isolates concurrent explain() calls via AsyncLocalStorage scopes", async () => {
    const [plan1, plan2] = await Promise.all([
      Car.where({ name: "honda" }).explain(),
      Car.all().explain(),
    ]);
    expect(plan1.length).toBeGreaterThan(0);
    expect(plan2.length).toBeGreaterThan(0);
    expect(plan1.toLowerCase()).toContain("where");
    expect(plan2.toLowerCase()).not.toContain("where");
  });

  function bindParam(name: string, value: unknown): QueryAttribute {
    return new QueryAttribute(name, value, new ValueType());
  }
});
