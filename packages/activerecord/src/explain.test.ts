import { describe, expect } from "vitest";
import { Base, registerModel } from "./index.js";
import { buildExplainClause } from "./explain.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { ValueType } from "@blazetrails/activemodel";
import { itIfSupports } from "./support/supports.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Car } from "./test-helpers/models/car.js";
import { Bulb } from "./test-helpers/models/bulb.js";

registerModel(Car);
registerModel(Bulb);

describe("ExplainTest", () => {
  const { self } = fixtures(["cars", "bulbs"]);

  itIfSupports("explain", "relation explain", async () => {
    const message = await Car.where({ name: "honda" }).explain().inspect();
    expect(message).toMatch(/^EXPLAIN/m);
  });

  itIfSupports("explain", "collecting queries for explain", async () => {
    const queries = await Base.collectingQueriesForExplain(async () => {
      await Car.where({ name: "honda" });
    });

    const [sql, binds] = queries[0];
    expect(sql).toMatch("SELECT");
    if (binds.length > 0) {
      expect(binds.length).toBe(1);
      expect((binds[binds.length - 1] as { value(): unknown }).value()).toBe("honda");
    } else {
      expect(sql).toMatch("honda");
    }
  });

  itIfSupports("explain", "relation explain with average", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.average("id");
      })
    )[0];
    const message = await Car.all().explain().average("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with count", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.count();
      })
    )[0];
    const message = await Car.all().explain().count();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with count and argument", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await (Car as any).count("id");
      })
    )[0];
    const message = await (Car.all().explain() as any).count("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with minimum", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.minimum("id");
      })
    )[0];
    const message = await Car.all().explain().minimum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with maximum", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.maximum("id");
      })
    )[0];
    const message = await Car.all().explain().maximum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with sum", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.sum("id");
      })
    )[0];
    const message = await Car.all().explain().sum("id");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with first", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.all().first();
      })
    )[0].replace(/LIMIT[\s\S]*/, "");
    const message = await Car.all().explain().first();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with last", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.all().last();
      })
    )[0].replace(/LIMIT[\s\S]*/, "");
    const message = await Car.all().explain().last();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with pluck", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.all().pluck();
      })
    )[0];
    const message = await Car.all().explain().pluck();
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "relation explain with pluck with args", async () => {
    const expectedQuery = (
      await self().captureSql({}, async () => {
        await Car.all().pluck("id", "name");
      })
    )[0];
    const message = await Car.all().explain().pluck("id", "name");
    expect(message).toMatch(/^EXPLAIN/m);
    expect(message).toMatch(expectedQuery);
  });

  itIfSupports("explain", "exec explain with no binds", async () => {
    const sqls = ["foo", "bar"];
    const queries: [string, unknown[]][] = [
      [sqls[0], []],
      [sqls[1], []],
    ];
    const adapter = (await Base.leaseConnection()) as unknown as {
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
    const adapter = (await Base.leaseConnection()) as unknown as {
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

  function bindParam(name: string, value: unknown): QueryAttribute {
    return new QueryAttribute(name, value, new ValueType());
  }
});
