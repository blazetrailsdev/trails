import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import type { JoinDependency } from "./associations/join-dependency.js";
import { lookupCastTypeFromJoinDependencies, typeFor } from "./relation/calculations.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";

// @internal

describe("lookupCastTypeFromJoinDependencies", () => {
  const fakeJoinDependency = (nodes: unknown[]): JoinDependency =>
    ({ each: (fn: (node: unknown) => void) => nodes.forEach(fn) }) as unknown as JoinDependency;

  it("returns cast type from a joined table's attributeTypes", () => {
    const intType = { cast: (v: unknown) => Number(v) };
    const fakeNode = { baseKlass: { attributeTypes: () => ({ credit_limit: intType }) } };
    const fakeJd = fakeJoinDependency([fakeNode]);
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "credit_limit",
      [fakeJd],
    );
    expect(result).toBe(intType);
  });

  it("returns null when name is not in any joined table", () => {
    const fakeNode = { baseKlass: { attributeTypes: () => ({ other: {} }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "missing",
      [fakeJoinDependency([fakeNode])],
    );
    expect(result).toBeNull();
  });

  it("returns first match when multiple join deps are present", () => {
    const type1 = { cast: (v: unknown) => String(v) };
    const type2 = { cast: (v: unknown) => Number(v) };
    const node1 = { baseKlass: { attributeTypes: () => ({ name: type1 }) } };
    const node2 = { baseKlass: { attributeTypes: () => ({ name: type2 }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "name",
      [fakeJoinDependency([node1]), fakeJoinDependency([node2])],
    );
    expect(result).toBe(type1);
  });

  it("supports attributeTypes as a plain object", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: { title: strType } } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [fakeJoinDependency([fakeNode])],
    );
    expect(result).toBe(strType);
  });

  it("supports attributeTypes as a Map", () => {
    const strType = { cast: (v: unknown) => String(v) };
    const fakeNode = { baseKlass: { attributeTypes: new Map([["title", strType]]) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "title",
      [fakeJoinDependency([fakeNode])],
    );
    expect(result).toBe(strType);
  });

  it("skips nodes without modelClass", () => {
    const type = { cast: (v: unknown) => v };
    const nodeMissing = { baseKlass: undefined };
    const nodeGood = { baseKlass: { attributeTypes: () => ({ val: type }) } };
    const result = lookupCastTypeFromJoinDependencies(
      {} as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "val",
      [fakeJoinDependency([nodeMissing, nodeGood])],
    );
    expect(result).toBe(type);
  });
});

describe("lookupCastTypeFromJoinDependencies integration", () => {
  class CalcAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("topics", {
        primaryKey: "name",
        foreignKey: "author_name",
        className: "Topic",
      });
    }
  }

  fixtures(["topics", "authors"]);

  it("resolves joined column cast type through the join-dependency walk", () => {
    const rel = CalcAuthor.joins(":topics");
    const castType = lookupCastTypeFromJoinDependencies(
      rel as unknown as Parameters<typeof lookupCastTypeFromJoinDependencies>[0],
      "written_on",
    ) as {
      constructor: { name: string };
    } | null;
    expect(castType).toBeTruthy();
    expect(castType?.constructor.name).not.toBe("ValueType");
  });
});

describe("grouped calculation keyed via Arel attribute type caster", () => {
  fixtures(["books"]);

  it("keys an enum group given as an Arel attribute by its labels", async () => {
    const { Book } = await import("./test-helpers/models/book.js");
    const result = await Book.group(Book.arelTable.get("status")).count();
    expect(result).toEqual(
      new Map([
        ["proposed", 2],
        ["published", 2],
      ]),
    );
  });
});

describe("multi-field grouped calculation key shape", () => {
  fixtures(["companies", "accounts"]);

  it("uniqs repeated group fields and keys by a scalar", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const result = (await Account.group("firm_id", "firm_id").count()) as Map<unknown, number>;
    expect([...result.keys()].every((k) => !Array.isArray(k))).toBe(true);
    expect(result.get(6)).toBe(2);
  });

  it("does not collapse distinct groups sharing their first field", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const single = (await Account.group("firm_id").count()) as Map<unknown, number>;
    const multi = (await Account.group("firm_id", "credit_limit").count()) as Map<unknown, number>;
    expect(single.get(6)).toBe(2);
    const firmSix = [...multi.entries()].filter(([k]) => (k as unknown[])[0] === 6);
    expect(firmSix.map(([, v]) => v)).toEqual([1, 1]);
    expect(firmSix.map(([k]) => (k as unknown[])[1]).sort()).toEqual([50, 55]);
  });
});

describe("multi-field grouped bigint sum", () => {
  fixtures([]);

  it("carries every group key through the bigint text-cast wrap", async () => {
    const { NumericData } = await import("./test-helpers/models/numeric-data.js");
    await NumericData.create({ world_population: 2n ** 62n, my_house_population: 1n });
    await NumericData.create({ world_population: 2n ** 62n, my_house_population: 2n });

    const result = (await NumericData.group("my_house_population", "world_population").sum(
      "atoms_in_universe",
    )) as Map<unknown, unknown>;

    const keys = [...result.keys()] as unknown[][];
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => Array.isArray(k) && k.length === 2)).toBe(true);
    expect(keys.map((k) => k[0]).sort()).toEqual([1, 2]);
    expect(keys.every((k) => k[1] === 2n ** 62n)).toBe(true);
  });
});

describe("grouped calculation HAVING on a composite-FK belongs_to", () => {
  fixtures([]);

  it("filters groups keyed by the associated composite-PK record", async () => {
    const { CpkBook, CpkAuthor, CpkChapter } = await import("./test-helpers/models/cpk.js");
    await CpkAuthor.create({ id: 1, name: "Author One" });
    await CpkBook.create({ id: [1, 1], title: "Alpha", revision: 1 });
    await CpkBook.create({ id: [1, 2], title: "Beta", revision: 2 });
    await CpkChapter.create({ id: [1, 10], book_id: 1, title: "ch-1" });
    await CpkChapter.create({ id: [1, 11], book_id: 1, title: "ch-2" });
    await CpkChapter.create({ id: [1, 12], book_id: 2, title: "ch-3" });

    const result = (await CpkChapter.group("book").having("COUNT(*) > 1").count()) as Map<
      unknown,
      number
    >;

    const entries = [...result.entries()] as [{ id: unknown[] } | null, number][];
    expect(entries).toHaveLength(1);
    expect(entries[0][0]?.id).toEqual([1, 1]);
    expect(entries[0][1]).toBe(2);
  });
});

describe("ungrouped calculation HAVING", () => {
  fixtures(["companies", "accounts"]);

  it("emits HAVING with no GROUP BY and filters the single aggregate row", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const total = (await Account.sum("credit_limit")) as number;
    expect(total).toBeGreaterThan(100);
    expect(await Account.having("sum(credit_limit) > 100").sum("credit_limit")).toBe(total);
    expect(await Account.having("sum(credit_limit) > 100000").sum("credit_limit")).toBe(0);
  });

  it("emits HAVING with no GROUP BY on the count paths", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const total = (await Account.count()) as number;
    const credited = (await Account.where("credit_limit IS NOT NULL").count()) as number;
    expect(total).toBeGreaterThan(1);
    expect(credited).toBeGreaterThan(1);

    expect(await Account.having("count(*) > 1").count()).toBe(total);
    expect(await Account.having("count(*) > 100000").count()).toBe(0);

    expect(await Account.having("count(*) > 1").count("credit_limit")).toBe(credited);
    expect(await Account.having("count(*) > 100000").count("credit_limit")).toBe(0);

    expect(await Account.distinct().having("count(*) > 1").count()).toBe(total);
    expect(await Account.distinct().having("count(*) > 100000").count()).toBe(0);
  });
});

describe("typeFor", () => {
  it("resolves a bare, qualified and node-shaped field through the model's attribute type", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const rel = Account.all() as unknown as Parameters<typeof typeFor>[0];
    const expected = Account.typeForAttribute("credit_limit");

    expect(typeFor(rel, "credit_limit")).toBe(expected);
    expect(typeFor(rel, "accounts.credit_limit")).toBe(expected);
    expect(typeFor(rel, Account.arelTable.get("credit_limit") as never)).toBe(expected);
  });

  it("returns the model's own type for an enum attribute without unwrapping the subtype", async () => {
    const { Book } = await import("./test-helpers/models/book.js");
    expect(Book.typeForAttribute("status")).toHaveProperty("subtypeType");
    expect(typeFor(Book.all() as unknown as Parameters<typeof typeFor>[0], "status")).toBe(
      Book.typeForAttribute("status"),
    );
  });
});

describe("empty-scope aggregate identities", () => {
  fixtures(["companies", "accounts"]);

  it("sums a bigint column through the column type on a contradictory scope", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const populated = await Account.sum("firm_id");
    const empty = await Account.where({ id: [] }).sum("firm_id");
    expect(empty).toBe(0);
    expect(typeof empty).toBe(typeof populated);
    expect(await Account.none().sum("firm_id")).toBe(0);
  });

  it("sums the identity value when no column is given", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const rows = (await Account.count()) as number;
    expect(await Account.sum()).toBe(0);
    expect(await Account.sum(1000)).toBe(1000 * rows);
    expect(await Account.calculate("sum", 1000)).toBe(1000 * rows);
    expect(await Account.all().calculate("sum", 1000)).toBe(1000 * rows);
    expect(await Account.asyncSum(1000)).toBe(1000 * rows);
  });

  it("async sums the nil identity value when no column is given", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const { captureSql } = await import("./testing/sql-capture.js");
    const queries = await captureSql(async () => {
      await expect(Account.asyncSum()).rejects.toThrow();
      await expect(Account.group("firm_id").asyncSum()).rejects.toThrow();
    });
    expect(queries[0]).toMatch(/SELECT SUM\(\) FROM/);
    expect(queries[1]).toMatch(/SELECT SUM\(\) AS ["`]?sum["`]?/);
  });

  it("sums the block return values onto the initial value", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const creditLimits = await Account.sum("credit_limit");
    expect(await Account.sum((account: { credit_limit: number }) => account.credit_limit)).toBe(
      Number(creditLimits),
    );
    expect(
      await Account.sum(1000, (account: { credit_limit: number }) => account.credit_limit),
    ).toBe(1000 + Number(creditLimits));
  });

  it("sums bigint block return values onto the default identity", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const rows = BigInt((await Account.count()) as number);
    expect(await Account.sum(() => 1n)).toBe(rows);
    expect(await Account.sum(1000, () => 1n)).toBe(1000n + rows);
  });

  it("rejects a non-numeric initial value for the block arm", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const sum = Account.sum as unknown as (
      initialValueOrColumn: unknown,
      block: () => number,
    ) => Promise<unknown>;
    await expect(sum.call(Account, "credit_limit", () => 1)).rejects.toThrow(
      "no implicit conversion of Integer into String",
    );
    const empty = Account.where({ id: [] }) as unknown as {
      sum(initialValueOrColumn: unknown, block: () => number): Promise<unknown>;
    };
    expect(await empty.sum("credit_limit", () => 1)).toBe("credit_limit");
  });

  it("sums the identity value through a collection proxy", async () => {
    const { Firm } = await import("./test-helpers/models/company.js");
    const firm = (await Firm.firstBang()) as unknown as {
      accounts: { sum(v?: string | number): Promise<number | bigint> };
    };
    const rows = Number(await firm.accounts.sum(1));
    expect(rows).toBeGreaterThan(0);
    expect(await firm.accounts.sum(1000)).toBe(1000 * rows);
  });

  it("keeps the empty identity for every aggregate on a contradictory scope", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    const empty = Account.where({ id: [] });
    expect(await empty.count()).toBe(0);
    expect(await empty.sum("credit_limit")).toBe(0);
    expect(await empty.average("credit_limit")).toBeNull();
    expect(await empty.minimum("credit_limit")).toBeNull();
    expect(await empty.maximum("credit_limit")).toBeNull();
  });
  it("returns no ids for a none relation", async () => {
    const { Account } = await import("./test-helpers/models/account.js");
    expect(await Account.none().ids()).toEqual([]);
  });
});
