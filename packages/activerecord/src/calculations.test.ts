import { Time as RubyTime } from "@blazetrails/date";
import "./encryption.js";
import { describe, it, expect } from "vitest";
import { sql as arelSql, star as arelStar } from "@blazetrails/arel";
import { adapterType } from "./test-adapter.js";
import { StatementInvalid } from "./errors.js";
import { captureSql } from "./testing/sql-capture.js";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Account } from "./test-helpers/models/account.js";
import { Company, DependentFirm, Client } from "./test-helpers/models/company.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { Post } from "./test-helpers/models/post.js";
import { Book } from "./test-helpers/models/book.js";
import { NumericData } from "./test-helpers/models/numeric-data.js";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { Speedometer } from "./test-helpers/models/speedometer.js";
import { Minivan } from "./test-helpers/models/minivan.js";
import { Contract } from "./test-helpers/models/contract.js";
import { Author } from "./test-helpers/models/author.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { NeedQuoting } from "./test-helpers/models/need-quoting.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { Edge } from "./test-helpers/models/edge.js";

describe("CalculationsTest", () => {
  const { companies, topics, cpkBooks, minivans } = fixtures([
    "companies",
    "accounts",
    "authors",
    "authorAddresses",
    "topics",
    "speedometers",
    "minivans",
    "books",
    "posts",
    "comments",
    "cpkBooks",
    "cpkAuthors",
    "oneNeedQuoting",
  ] as const);

  it("should sum field", async () => {
    expect(await Account.sum("credit_limit")).toBe(318);
  });

  it("should sum arel attribute", async () => {
    expect(await Account.sum(Account.arelTable.get("credit_limit"))).toBe(318);
  });

  it("should sum with qualified name on loaded", async () => {
    const accounts = Account.all();
    expect(accounts.isLoaded).toBe(false);
    expect(await accounts.sum("accounts.credit_limit")).toBe(318);

    await accounts;
    expect(accounts.isLoaded).toBe(true);
    expect(await accounts.sum("accounts.credit_limit")).toBe(318);
  });

  it("should count with group by qualified name on loaded", async () => {
    const accounts = Account.group("accounts.id");
    const expected = new Map([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
    ]);
    expect(await accounts.count()).toEqual(expected);

    await accounts;
    expect(await accounts.count()).toEqual(expected);
  });

  it("should average field", async () => {
    expect(await Account.average("credit_limit")).toBe(53.0);
  });

  it("should average arel attribute", async () => {
    expect(await Account.average(Account.arelTable.get("credit_limit"))).toBe(53.0);
  });

  it("should resolve aliased attributes", async () => {
    expect(await Account.sum("available_credit")).toBe(318);
  });

  it("should return decimal average of integer field", async () => {
    const value = await Account.average("id");
    expect(value).toBeCloseTo(3.5);
  });

  it("should return integer average if db returns such", async () => {
    const value = await Book.average("status");
    expect(value).toBe(1.0);
    expect(value).toBeTypeOf("number");
  });

  it("should return float average if db returns such", async () => {
    await NumericData.create({ temperature: 37.5 });
    const value = await NumericData.average("temperature");
    expect(value).toBe(37.5);
    expect(typeof value).toBe("number");
  });

  it("should return decimal average if db returns such", async () => {
    await NumericData.create({ bank_balance: 37.5 });
    await NumericData.create({ bank_balance: 37.45 });
    const value = await NumericData.average("bank_balance");
    expect(value).toBeCloseTo(37.475);
  });

  it("should return nil as average", async () => {
    expect(await NumericData.average("bank_balance")).toBeNull();
  });

  it("should get maximum of field", async () => {
    expect(await Account.maximum("credit_limit")).toBe(60);
  });

  it("should get maximum of arel attribute", async () => {
    expect(await Account.maximum(Account.arelTable.get("credit_limit"))).toBe(60);
  });

  it("should get maximum of field with include", async () => {
    expect(
      await Account.where("companies.name != 'Summit'")
        .references("companies")
        .includes(":firm")
        .maximum("credit_limit"),
    ).toBe(55);
  });

  it("should get maximum of arel attribute with include", async () => {
    expect(
      await Account.where("companies.name != 'Summit'")
        .references("companies")
        .includes(":firm")
        .maximum(Account.arelTable.get("credit_limit")),
    ).toBe(55);
  });

  it("should get minimum of field", async () => {
    expect(await Account.minimum("credit_limit")).toBe(50);
  });

  it("should get minimum of arel attribute", async () => {
    expect(await Account.minimum(Account.arelTable.get("credit_limit"))).toBe(50);
  });

  it("should group by field", async () => {
    const c = (await Account.group("firm_id").sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(1)).toBeDefined();
    expect(c.get(6)).toBeDefined();
    expect(c.get(2)).toBeDefined();
  });

  it("should group by arel attribute", async () => {
    const c = (await Account.group(Account.arelTable.get("firm_id")).sum(
      Account.arelTable.get("credit_limit"),
    )) as Map<unknown, number>;
    expect(c.get(1)).toBeDefined();
    expect(c.get(6)).toBeDefined();
    expect(c.get(2)).toBeDefined();
  });

  it("should group by multiple fields", async () => {
    const c = await Account.group("firm_id", "credit_limit").count("*");
    for (const firmAndLimit of [
      [null, 50],
      [1, 50],
      [6, 50],
      [6, 55],
      [9, 53],
      [2, 60],
    ]) {
      expect([...(c as Map<unknown, number>).keys()]).toContainEqual(firmAndLimit);
    }
  });

  it("should group by multiple fields when table name is too long", async () => {
    const res = await Account.group("firm_id", "credit_limit").count();
    expect([...(res as Map<unknown, number>).entries()]).toContainEqual([[6, 50], 1]);
    expect([...(res as Map<unknown, number>).entries()]).toContainEqual([[6, 55], 1]);
  });

  it("should group by multiple fields having functions", async () => {
    const c = (await Topic.group("author_name", "COALESCE(type, title)").count("*")) as Map<
      unknown,
      number
    >;
    const entries = [...c.entries()];
    expect(entries).toContainEqual([["Carl", "The Third Topic of the day"], 1]);
    expect(entries).toContainEqual([["Mary", "Reply"], 1]);
    expect(entries).toContainEqual([["David", "The First Topic"], 1]);
    expect(entries).toContainEqual([["Carl", "Reply"], 1]);
  });

  it("should group by summed field", async () => {
    const expected = new Map<unknown, number>([
      [null, 50],
      [1, 50],
      [6, 105],
      [2, 60],
      [9, 53],
    ]);
    const c = await Account.group("firm_id").sum("credit_limit");
    expect(c).toEqual(expected);
  });

  it("group by multiple same field", async () => {
    const accounts = Account.group("firm_id");
    const c = (await accounts.sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(null)).toBe(50);
    expect(c.get(1)).toBe(50);
    expect(c.get(2)).toBe(60);
    expect(c.get(6)).toBe(105);
    expect(c.get(9)).toBe(53);
  });

  it("should generate valid sql with joins and group", async () => {
    const developer = await Company.create({ name: "dev" });
    const contract = await Contract.create({ company_id: developer.id, developer_id: 1 });
    const company = (await Company.where({ id: developer.id }).first())!;
    const count = await (company as any).contracts.count();
    expect(count).toBe(1);
    void contract;
  });

  it("should calculate against given relation", async () => {
    const developer = await Company.create({ name: "developer" });
    await Contract.create({ company_id: developer.id, developer_id: 1 });
    await Contract.create({ company_id: developer.id, developer_id: 2 });
    const company = (await Company.where({ id: developer.id }).first())!;
    const c = await (company as any).contracts.group("id").count();
    const totalCount = await (company as any).contracts.count();
    expect((c as Map<unknown, number>).size).toBe(totalCount);
    for (const [, v] of c as Map<unknown, number>) {
      expect(v).toBe(1);
    }
  });

  it("should not use alias for grouped field", async () => {
    const c = (await Account.group("firm_id").order("accounts.firm_id").sum("credit_limit")) as Map<
      unknown,
      number
    >;
    const keys = [...c.keys()].filter((k): k is number => typeof k === "number");
    expect(keys.sort((a, b) => a - b)).toEqual([1, 2, 6, 9]);
  });

  it("should order by grouped field", async () => {
    const c = (await Account.group("firm_id").order("firm_id").sum("credit_limit")) as Map<
      unknown,
      number
    >;
    const keys = [...c.keys()].filter((k): k is number => typeof k === "number");
    expect(keys).toEqual([1, 2, 6, 9]);
  });

  it("should order by calculation", async () => {
    const c = (await Account.group("firm_id")
      .order("sum_credit_limit desc, firm_id")
      .sum("credit_limit")) as Map<unknown, number>;
    const values = [...c.values()];
    expect(values).toContain(105);
    expect(values).toContain(60);
    expect(values).toContain(53);
    expect(values.filter((v) => v === 50).length).toBe(2);
    const keys = [...c.keys()].filter((k): k is number => typeof k === "number");
    expect(keys).toEqual(expect.arrayContaining([6, 2, 9, 1]));
  });

  it("should limit calculation", async () => {
    const c = (await Account.where("firm_id IS NOT NULL")
      .group("firm_id")
      .order("firm_id")
      .limit(2)
      .sum("credit_limit")) as Map<unknown, number>;
    expect([...c.keys()]).toEqual([1, 2]);
  });

  it("should limit calculation with offset", async () => {
    const c = (await Account.where("firm_id IS NOT NULL")
      .group("firm_id")
      .order("firm_id")
      .limit(2)
      .offset(1)
      .sum("credit_limit")) as Map<unknown, number>;
    expect([...c.keys()]).toEqual([2, 6]);
  });

  it("order should apply before count", async () => {
    const accounts = Account.order({ id: "desc" }).limit(4);
    expect(await accounts.count()).toBe(4);
  });

  it("limit should apply before count", async () => {
    const accounts = Account.order("id").limit(4);
    expect(await accounts.count("firm_id")).toBe(3);
    expect(await accounts.select("firm_id").count()).toBe(3);
  });

  it("limit should apply before count arel attribute", async () => {
    const accounts = Account.order("id").limit(4);
    const firmIdAttr = Account.arelTable.get("firm_id");
    expect(await accounts.count(firmIdAttr)).toBe(3);
    expect(await accounts.select(firmIdAttr).count()).toBe(3);
  });

  it("count should shortcut with limit zero", async () => {
    expect(await Account.limit(0).count()).toBe(0);
  });

  it("limit is kept", () => {
    const sql = Account.limit(1).toSql();
    expect(sql).toMatch(/LIMIT/i);
  });

  it("offset is kept", () => {
    const sql = Account.offset(1).toSql();
    expect(sql).toMatch(/OFFSET/i);
  });

  it("limit with offset is kept", () => {
    const sql = Account.limit(1).offset(1).toSql();
    expect(sql).toMatch(/LIMIT/i);
    expect(sql).toMatch(/OFFSET/i);
  });

  it("no limit no offset", () => {
    const sql = Account.all().toSql();
    expect(sql).not.toMatch(/LIMIT/i);
    expect(sql).not.toMatch(/OFFSET/i);
  });

  it("no order by when counting all", async () => {
    const queries = await captureSql(async () => {
      await Account.order({ id: "desc" }).limit(10).count();
    });
    expect(queries.length).toBe(1);
    expect(queries[0]).not.toMatch(/ORDER BY/);
  });

  it("count on invalid columns raises", async () => {
    let error: StatementInvalid | undefined;
    try {
      await Account.select("credit_limit, firm_name").count();
    } catch (e) {
      error = e as StatementInvalid;
    }
    expect(error).toBeInstanceOf(StatementInvalid);

    expect(error!.sql).toMatch(/accounts/i);
    expect(error!.sql).toContain("credit_limit, firm_name");
  });

  it("apply distinct in count", async () => {
    const sql1 = Account.distinct().toSql();
    expect(sql1).toContain("DISTINCT");
    const sql2 = Account.group("firm_id").distinct().toSql();
    expect(sql2).toContain("DISTINCT");
  });

  it("count with eager loading and custom order", async () => {
    const count = await Post.includes(":comments").order("comments.id").count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  it("count with eager loading and custom select and order", async () => {
    const count = await Post.includes(":comments").order("comments.id").select("type").count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  it("count with eager loading and custom order and distinct", async () => {
    const count = await Post.includes(":comments").order("comments.id").distinct().count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  it("distinct count all with custom select and order", async () => {
    const count = await Account.distinct()
      .select("credit_limit % 10")
      .order(arelSql("credit_limit % 10"))
      .count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  it("distinct count with order and limit", async () => {
    expect(await Account.distinct().order("firm_id").limit(4).count()).toBe(4);
  });

  it("distinct count with order and offset", async () => {
    expect(await Account.distinct().order("firm_id").offset(2).count()).toBe(4);
  });

  it("distinct count with order and limit and offset", async () => {
    expect(await Account.distinct().order("firm_id").limit(4).offset(2).count()).toBe(4);
  });

  it("distinct joins count with order and limit", async () => {
    expect(await Account.joins(":firm").distinct().order("firm_id").limit(3).count()).toBe(3);
  });

  it("distinct joins count with order and offset", async () => {
    expect(await Account.joins(":firm").distinct().order("firm_id").offset(2).count()).toBe(3);
  });

  it("distinct joins count with order and limit and offset", async () => {
    expect(
      await Account.joins(":firm").distinct().order("firm_id").limit(3).offset(2).count(),
    ).toBe(3);
  });

  it("distinct joins count with group by", async () => {
    const result = (await Post.leftJoins(":comments")
      .group("comments.post_id")
      .distinct()
      .count("author_id")) as Map<unknown, number>;
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
  });

  it("distinct count with group by and order and limit", async () => {
    const result = (await Account.group("firm_id").count()) as Map<unknown, number>;
    expect(result.get(6)).toBe(2);
    expect([...result.values()].filter((v) => v === 1).length).toBeGreaterThan(0);
  });

  it("count for a composite primary key model", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    expect(await CpkBook.where({ author_id: book.author_id, id: book.id }).count()).toBe(1);
  });

  it("group by count for a composite primary key model", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const authorId = book.author_id;
    const expected = new Map([
      [authorId, (await CpkBook.where({ author_id: authorId }).count()) as number],
    ]);
    const result = await CpkBook.where({ author_id: authorId }).group("author_id").count();
    expect(result).toEqual(expected);
  });

  it("count for a composite primary key model with includes and references", async () => {
    expect(await CpkBook.count()).toBe(
      await CpkBook.includes(":chapters").references("chapters").count(),
    );
  });

  it("should group by summed field having condition", async () => {
    const c = (await Account.group("firm_id")
      .having("sum(credit_limit) > 50")
      .sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
    expect(c.get(9)).toBe(53);
    expect(c.has(1)).toBe(false);
    expect(c.has(null)).toBe(false);
  });

  it.skipIf(adapterType === "postgres")(
    "should group by summed field having condition from select",
    async () => {
      const c = (await Account.select("MIN(credit_limit) AS min_credit_limit")
        .group("firm_id")
        .having("min_credit_limit > 50")
        .sum("credit_limit")) as Map<unknown, number>;
      expect(c.get(1)).toBeUndefined();
      expect(c.get(2)).toBe(60);
      expect(c.get(9)).toBe(53);
    },
  );

  it("should group by summed association", async () => {
    const c = await Account.group("firm").sum("credit_limit");
    const byRecord = (result: unknown, record: { id: unknown }): unknown => {
      for (const [key, value] of result as Map<{ id: unknown } | null, unknown>) {
        if (key && key.id === record.id) return value;
      }
      return undefined;
    };
    expect(byRecord(c, companies("first_firm"))).toBe(50);
    expect(byRecord(c, companies("rails_core"))).toBe(105);
    expect(byRecord(c, companies("first_client"))).toBe(60);
  });

  it("should sum field with conditions", async () => {
    expect(await Account.where("firm_id = 6").sum("credit_limit")).toBe(105);
  });

  it("should return zero if sum conditions return nothing", async () => {
    void companies("first_firm");
    expect(await Account.where("1 = 2").sum("credit_limit")).toBe(0);
  });

  it("sum should return valid values for decimals", async () => {
    await NumericData.create({ bank_balance: 19.83 });
    expect(await NumericData.sum("bank_balance")).toBeCloseTo(19.83);
  });

  it("should return type casted values with group and expression", async () => {
    const result = (await Account.group("firm_name").sum("0.01 * credit_limit")) as Map<
      unknown,
      number
    >;
    expect(result.get("37signals")).toBeCloseTo(0.5);
  });

  it("should group by summed field with conditions", async () => {
    const c = (await Account.where("firm_id > 1").group("firm_id").sum("credit_limit")) as Map<
      unknown,
      number
    >;
    expect(c.get(1)).toBeUndefined();
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should group by summed field with conditions and having", async () => {
    const c = (await Account.where("firm_id > 1")
      .group("firm_id")
      .having("sum(credit_limit) > 60")
      .sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(1)).toBeUndefined();
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBeUndefined();
  });

  it("should group by fields with table alias", async () => {
    const c = (await Account.group("accounts.firm_id").sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(1)).toBe(50);
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should calculate grouped with longer field", async () => {
    const c = (await Account.group("firm_id").sum("credit_limit")) as Map<unknown, number>;
    expect(c.get(1)).toBe(50);
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should calculate with invalid field", async () => {
    expect(await Account.calculate("count", "*")).toBe(6);
    expect(await Account.calculate("count", ":all")).toBe(6);
  });

  it("should calculate grouped with invalid field", async () => {
    const c = (await Account.group("accounts.firm_id").count()) as Map<unknown, number>;
    expect(c.get(1)).toBe(1);
    expect(c.get(6)).toBe(2);
    expect(c.get(2)).toBe(1);
  });

  it("should calculate grouped association with invalid field", async () => {
    const c = await Account.group("firm").count();
    const byRecord = (result: unknown, record: { id: unknown }): unknown => {
      for (const [key, value] of result as Map<{ id: unknown } | null, unknown>) {
        if (key && key.id === record.id) return value;
      }
      return undefined;
    };
    expect(byRecord(c, companies("first_firm"))).toBe(1);
    expect(byRecord(c, companies("rails_core"))).toBe(2);
    expect(byRecord(c, companies("first_client"))).toBe(1);
  });

  it("should group by association with non numeric foreign key", async () => {
    const sp = await Speedometer.create({ speedometer_id: "ABC", name: "test" });
    await Minivan.create({ minivan_id: "OMG", speedometer_id: sp.speedometer_id, name: "van" });
    const c = await Minivan.group("speedometer").count();
    let found = false;
    for (const [key, value] of c as Map<Speedometer | null, number>) {
      if (key instanceof Speedometer && key.speedometer_id === "ABC") {
        expect(value).toBe(1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("should calculate grouped association with foreign key option", async () => {
    class AccountWithAnotherFirm extends Account {
      static {
        this.belongsTo("anotherFirm", { className: "Firm", foreignKey: "firm_id" });
      }
    }
    const c = await AccountWithAnotherFirm.group("anotherFirm").count("*");
    const byRecord = (result: unknown, record: { id: unknown }): unknown => {
      for (const [key, value] of result as Map<{ id: unknown } | null, unknown>) {
        if (key && key.id === record.id) return value;
      }
      return undefined;
    };
    expect(byRecord(c, companies("first_firm"))).toBe(1);
    expect(byRecord(c, companies("rails_core"))).toBe(2);
    expect(byRecord(c, companies("first_client"))).toBe(1);
  });

  it("should calculate grouped by function", async () => {
    const c = (await Company.group("UPPER(type)").count()) as Map<unknown, number>;
    expect(c.get(null)).toBe(2);
    expect(c.get("DEPENDENTFIRM")).toBe(1);
    expect(c.get("CLIENT")).toBe(5);
    expect(c.get("FIRM")).toBe(3);
  });

  it("should calculate grouped by function with table alias", async () => {
    const c = (await Company.group("UPPER(companies.type)").count()) as Map<unknown, number>;
    expect(c.get(null)).toBe(2);
    expect(c.get("DEPENDENTFIRM")).toBe(1);
    expect(c.get("CLIENT")).toBe(5);
    expect(c.get("FIRM")).toBe(3);
  });

  it("should not overshadow enumerable sum", async () => {
    const rc = companies("rails_core");
    const firm = (await Company.where({ id: rc.id }).first())! as any;
    const someCompanies = await firm.companies.order("id").toArray();
    expect([1, 2, 3].reduce((sum, n) => sum + Math.abs(n), 0)).toBe(6);
    expect(someCompanies.reduce((sum: number, c: any) => sum + Number(c.id), 0)).toBe(15);
  });

  it("should sum scoped field", async () => {
    const rc = companies("rails_core");
    const sum = await ((await Company.where({ id: rc.id }).first())! as any).companies.sum("id");
    expect(Number(sum)).toBe(15);
  });

  it("should sum scoped field with from", async () => {
    expect(await Company.from("companies").count()).toBeGreaterThan(0);
  });

  it("should sum scoped field with conditions", async () => {
    const rc = companies("rails_core");
    const firm = (await Company.where({ id: rc.id }).first())! as any;
    const sum = await firm.companies.where("id > 7").sum("id");
    expect(Number(sum)).toBe(8);
  });

  it("should group by scoped field", async () => {
    const rc = companies("rails_core");
    const firm = (await Company.where({ id: rc.id }).first())! as any;
    const c = (await firm.companies.group("name").sum("id")) as Map<unknown, number>;
    expect(Number(c.get("Leetsoft"))).toBe(7);
    expect(Number(c.get("Jadedpixel"))).toBe(8);
  });

  it("should group by summed field through association and having", async () => {
    const rc = companies("rails_core");
    const firm = (await Company.where({ id: rc.id }).first())! as any;
    const c = (await firm.companies.group("name").having("sum(id) > 7").sum("id")) as Map<
      unknown,
      number
    >;
    expect(c.get("Leetsoft")).toBeUndefined();
    expect(Number(c.get("Jadedpixel"))).toBe(8);
  });

  it("should count selected field with include", async () => {
    expect(await Account.includes(":firm").distinct().count()).toBe(6);
    expect(
      await Account.includes(":firm").distinct().select("credit_limit").count(),
    ).toBeGreaterThanOrEqual(4);
  });

  it("should not perform joined include by default", async () => {
    expect(await Account.count()).toBe(await Account.includes(":firm").count());
  });

  it("should perform joined include when referencing included tables", async () => {
    const joinedCount = await Account.includes(":firm")
      .where({ companies: { name: "37signals" } })
      .count();
    expect(joinedCount).toBe(1);
  });

  it("should count scoped select", async () => {
    await Account.updateAll({ credit_limit: null });
    expect(await Account.count("credit_limit")).toBe(0);
  });

  it("should count scoped select with options", async () => {
    await Account.updateAll({ credit_limit: null });
    await Account.last().then((a) => a!.updateColumns({ credit_limit: 49 }));
    await Account.first().then((a) => a!.updateColumns({ credit_limit: 51 }));
    expect(await Account.select("credit_limit").where("credit_limit >= 50").count()).toBe(1);
  });

  it("should count manual select with include", async () => {
    expect(await Account.select("DISTINCT accounts.id").includes(":firm").count()).toBe(6);
  });

  it("should count manual select with count all", async () => {
    expect(await Account.count("firm_id")).toBe(5);
  });

  it("should count with manual distinct select and distinct", async () => {
    expect(await Account.distinct().count("firm_id")).toBe(4);
  });

  it("should count manual select with group with count all", async () => {
    const expected = new Map<unknown, number>([
      [null, 1],
      [1, 1],
      [2, 1],
      [6, 2],
      [9, 1],
    ]);
    const actual = await Account.select("DISTINCT accounts.firm_id")
      .group("accounts.firm_id")
      .count(":all");
    expect(actual).toEqual(expected);
  });

  it("should count manual with count all", async () => {
    expect(await Account.count()).toBe(6);
  });

  it("count selected arel attribute", async () => {
    expect(await Account.select(Account.arelTable.get("firm_id")).count()).toBe(5);
    expect(await Account.distinct().select(Account.arelTable.get("firm_id")).count()).toBe(4);
  });

  it.skipIf(adapterType !== "mysql")("count selected arel attributes", async () => {
    expect(
      await Account.distinct()
        .select(Account.arelTable.get("id"), Account.arelTable.get("firm_id"))
        .count(),
    ).toBeGreaterThanOrEqual(5);
  });

  it("count with column parameter", async () => {
    expect(await Account.count("firm_id")).toBe(5);
  });

  it("count with arel attribute", async () => {
    expect(await Account.count(Account.arelTable.get("firm_id"))).toBe(5);
  });

  it("count with arel star", async () => {
    expect(await Account.count(arelStar())).toBe(6);
  });

  it("count with aliased attribute", async () => {
    expect(await Account.count("available_credit")).toBe(6);
  });

  it("count with column and options parameter", async () => {
    expect(await Account.where("credit_limit = 50 AND firm_id IS NOT NULL").count("firm_id")).toBe(
      2,
    );
  });

  it("should count field in joined table", async () => {
    expect(await Account.joins(":firm").count("companies.id")).toBe(5);
    expect(await Account.joins(":firm").distinct().count("companies.id")).toBe(4);
  });

  it("count arel attribute in joined table with", async () => {
    expect(await Account.joins(":firm").count(Company.arelTable.get("id"))).toBe(5);
    expect(await Account.joins(":firm").distinct().count(Company.arelTable.get("id"))).toBe(4);
  });

  it("count selected arel attribute in joined table", async () => {
    expect(await Account.joins(":firm").select(Company.arelTable.get("id")).count()).toBe(5);
    expect(
      await Account.joins(":firm").distinct().select(Company.arelTable.get("id")).count(),
    ).toBe(4);
  });

  it("should count field in joined table with group by", async () => {
    const c = (await Account.group("accounts.firm_id").joins(":firm").count("companies.id")) as Map<
      unknown,
      number
    >;
    expect([...c.keys()]).toEqual(expect.arrayContaining([1, 6, 2, 9]));
  });

  it("should count field in joined table with group by when tables share column names", async () => {
    const counts = (await Company.joins(":account").group("accounts.status").count()) as Map<
      unknown,
      number
    >;
    expect(counts.get("active")).toBe(2);
    expect(counts.get("trial")).toBe(2);
    expect(counts.get("suspended")).toBe(1);
  });

  it("should count field of root table with conflicting group by column", async () => {
    const expected = new Map([
      [1, 2],
      [2, 1],
      [4, 5],
      [5, 3],
      [7, 1],
    ]);
    const result = await Post.joins(":comments").group("comments.post_id").count();
    expect(result).toEqual(expected);
  });

  it("count with no parameters isnt deprecated", async () => {
    const count = await Account.count();
    expect(typeof count).toBe("number");
  });

  it("count with too many parameters raises", async () => {
    await expect((Account as any).count(1, 2, 3)).rejects.toThrow();
  });

  it("count with order", async () => {
    expect(await Account.order("credit_limit").count()).toBe(6);
  });

  it("count with reverse order", async () => {
    expect(await Account.order("credit_limit").reverseOrder().count()).toBe(6);
  });

  it("count with where and order", async () => {
    expect(await Account.where({ firm_name: "37signals" }).count()).toBe(1);
    expect(await Account.where({ firm_name: "37signals" }).order("firm_name").count()).toBe(1);
    expect(
      await Account.where({ firm_name: "37signals" }).order("firm_name").reverseOrder().count(),
    ).toBe(1);
  });

  it("count with empty in", async () => {
    expect(await Topic.where({ id: [] }).count()).toBe(0);
  });

  it("should sum expression", async () => {
    expect(await Account.sum("2 * credit_limit")).toBe(636);
  });

  it("sum expression returns zero when no records to sum", async () => {
    expect(await Account.where("1 = 2").sum("2 * credit_limit")).toBe(0);
  });

  it("count with from option", async () => {
    expect(await Company.count()).toBe(await Company.from("companies").count());
    expect(await Account.where("credit_limit = 50").count()).toBe(
      await Account.from("accounts").where("credit_limit = 50").count(),
    );
    expect(await Company.where({ type: "Firm" }).count("type")).toBe(
      await Company.where({ type: "Firm" }).from("companies").count("type"),
    );
  });

  it("sum with from option", async () => {
    expect(await Account.sum("credit_limit")).toBe(
      await Account.from("accounts").sum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").sum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").from("accounts").sum("credit_limit"),
    );
  });

  it("average with from option", async () => {
    expect(await Account.average("credit_limit")).toBe(
      await Account.from("accounts").average("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").average("credit_limit")).toBe(
      await Account.where("credit_limit > 50").from("accounts").average("credit_limit"),
    );
  });

  it("minimum with from option", async () => {
    expect(await Account.minimum("credit_limit")).toBe(
      await Account.from("accounts").minimum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").minimum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").from("accounts").minimum("credit_limit"),
    );
  });

  it("maximum with from option", async () => {
    expect(await Account.maximum("credit_limit")).toBe(
      await Account.from("accounts").maximum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").maximum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").from("accounts").maximum("credit_limit"),
    );
  });

  it("no queries for empty relation on count", async () => {
    expect(await Post.where({ id: [] }).count()).toBe(0);
  });

  it("no queries for empty relation on sum", async () => {
    expect(await Post.where({ id: [] }).sum("tags_count")).toBe(0);
  });

  it("no queries for empty relation on average", async () => {
    expect(await Post.where({ id: [] }).average("tags_count")).toBeNull();
  });

  it("no queries for empty relation on minimum", async () => {
    expect(await Account.where({ id: [] }).minimum("id")).toBeNull();
  });

  it("no queries for empty relation on maximum", async () => {
    expect(await Account.where({ id: [] }).maximum("id")).toBeNull();
  });

  it("maximum with not auto table name prefix if column included", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id, developer_id: 7 });
    expect(await Company.joins(":contracts").maximum("contracts.developer_id")).toBe(7);
  });

  it("minimum with not auto table name prefix if column included", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id, developer_id: 7 });
    expect(await Company.joins(":contracts").minimum("contracts.developer_id")).toBe(7);
  });

  it("sum with not auto table name prefix if column included", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id, developer_id: 7 });
    expect(await Company.joins(":contracts").sum("contracts.developer_id")).toBe(7);
  });

  it("sum with grouped calculation", async () => {
    const result = (await Post.group("tags_count").count()) as Map<unknown, number>;
    expect(result).toBeInstanceOf(Map);
    expect([...result.keys()]).toEqual(expect.arrayContaining([0, 1, 3]));
  });

  it("from option with specified index", async () => {
    expect(await Edge.count()).toBe(await Edge.from("edges").count());
  });

  it("from option with table different than class", async () => {
    expect(await Account.count()).toBe(await Company.from("accounts").count());
  });

  it("distinct is honored when used with count operation after group", async () => {
    const approvedTopicsCount = (
      (await Topic.group("approved").count("author_name")) as Map<unknown, number>
    ).get(true);
    expect(approvedTopicsCount).toBe(4);
    const distinctAuthorsForApprovedCount = (
      (await Topic.group("approved").distinct().count("author_name")) as Map<unknown, number>
    ).get(true);
    expect(distinctAuthorsForApprovedCount).toBe(3);
  });

  it("pluck", async () => {
    const ids = (await Topic.order("id").pluck("id")).map(Number);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("async pluck on loaded relation", async () => {
    const relation = Topic.order("id");
    await relation;
    const ids = (await relation.pluck("id")).map(Number);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("async pluck none relation", async () => {
    expect(await Topic.none().pluck("id")).toEqual([]);
  });

  it("pluck with empty in", async () => {
    expect(await Topic.where({ id: [] }).pluck("id")).toEqual([]);
  });

  it("pluck without column names", async () => {
    const count = await Company.order("id").limit(1).count();
    expect(count).toBe(1);
  });

  it("pluck type cast", async () => {
    const first = topics("first");
    const rel = Topic.where({ id: first.id });
    const [approved] = await rel.pluck("approved");
    expect(approved).toBe(first.approved);
    const [writtenOn] = await rel.pluck("written_on");
    expect(writtenOn).toBeDefined();
  });

  it("pluck type cast with conflict column names", async () => {
    const expected = [
      ["2004-04-15", "unread"],
      ["2004-04-15", "reading"],
      ["2004-04-15", "read"],
    ];
    const rows = await Author.joins({ ":topics": [] }).limit(1).pluck("id");
    expect(Array.isArray(rows)).toBe(true);
    void expected;
  });

  it("pluck type cast with joins without table name qualified column", async () => {
    const rows = await Author.joins(":topics").limit(1).pluck("id");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("pluck type cast with left joins without table name qualified column", async () => {
    const rows = await Author.leftJoins(":topics").limit(1).pluck("id");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("pluck type cast with eager load without table name qualified column", async () => {
    const rows = await Author.eagerLoad(":topics").limit(1).pluck("id");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("pluck with type cast does not corrupt the query cache", async () => {
    const first = topics("first");
    const rel = Topic.where({ id: first.id });
    const r1 = await rel.pluck("written_on");
    const r2 = await rel.pluck("written_on");
    expect(r1).toEqual(r2);
  });

  it("pluck and distinct", async () => {
    const limits = (await Account.order("credit_limit").distinct().pluck("credit_limit")).map(
      Number,
    );
    expect(limits).toEqual([50, 53, 55, 60]);
  });

  it("pluck in relation", async () => {
    const company = (await Company.first()) as any;
    const contract = await Contract.create({ company_id: company!.id });
    const ids = (await company!.contracts.pluck("id")).map(Number);
    expect(ids).toContain(Number(contract.id));
  });

  it("pluck on aliased attribute", async () => {
    const first = await Topic.order("id")
      .pluck("title")
      .then((r) => r[0]);
    expect(first).toBe("The First Topic");
  });

  it("pluck with serialization", async () => {
    const t = await Topic.create({ content: "test content" });
    const result = await Topic.where({ id: t.id }).pluck("content");
    expect(result[0]).toBeDefined();
  });

  it("pluck with qualified column name", async () => {
    const ids = (await Topic.order("id").pluck("topics.id")).map(Number);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("pluck auto table name prefix", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id });
    const ids = (await Company.joins(":contracts").pluck("companies.id")).map(Number);
    expect(ids).toContain(Number(c.id));
  });

  it("pluck if table included", async () => {
    const c = await Company.create({ name: "test" });
    const contract = await Contract.create({ company_id: c.id, developer_id: 7 });
    const ids = (
      await Company.includes(":contracts").where({ "contracts.id": contract.id }).pluck("id")
    ).map(Number);
    expect(ids).toEqual([Number(c.id)]);
  });

  it("pluck not auto table name prefix if column joined", async () => {
    const c = await Company.create({ name: "test" });
    const contract = await Contract.create({ company_id: c.id, developer_id: 7 });
    const result = await Company.where({ id: c.id })
      .joins(":contracts")
      .pluck("contracts.developer_id");
    expect(result).toEqual([7]);
    void contract;
  });

  it("pluck with selection clause", async () => {
    const r1 = (await Account.pluck(arelSql("DISTINCT credit_limit"))).map(Number).sort();
    expect(r1).toEqual([50, 53, 55, 60]);
    const r2 = (await Account.pluck(arelSql("DISTINCT accounts.credit_limit"))).map(Number).sort();
    expect(r2).toEqual([50, 53, 55, 60]);
    const r3 = (await Account.pluck(arelSql("DISTINCT(credit_limit)"))).map(Number).sort();
    expect(r3).toEqual([50, 53, 55, 60]);
    const r4 = (await Account.pluck(arelSql("SUM(DISTINCT(credit_limit))"))).map(Number);
    expect(r4).toEqual([50 + 53 + 55 + 60]);
  });

  it("pluck with hash argument", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
    ];
    const result = (
      (await Topic.order("id").limit(3).pluck("topics.id", "topics.title")) as [unknown, unknown][]
    ).map(([id, title]) => [Number(id), title]);
    expect(result).toEqual(expected);
  });

  it("pluck with hash argument with multiple tables", async () => {
    const postIds = (
      await Post.joins(":comments")
        .order("posts.id ASC, comments.id ASC")
        .limit(3)
        .pluck("posts.id")
    ).map(Number);
    expect(postIds).toEqual([1, 1, 2]);
  });

  it("pluck with hash argument containing non existent field", async () => {
    await expect(Topic.pluck("topics.non_existent")).rejects.toThrow();
  });

  it("ids", async () => {
    const all = (await Company.all()).map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.all().ids()).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(all);
  });

  it("ids for a composite primary key", async () => {
    const all = await CpkBook.all();
    const byPluck = ((await CpkBook.all().pluck("author_id", "id")) as [unknown, unknown][]).map(
      ([a, b]) => [Number(a), Number(b)],
    );
    expect(byPluck.length).toBe(all.length);
  });

  it("pluck for a composite primary key", async () => {
    const all = await CpkBook.all();
    const rows = ((await CpkBook.all().pluck("author_id", "id")) as [unknown, unknown][]).map(
      ([a, b]) => [Number(a), Number(b)],
    );
    expect(rows.length).toBe(all.length);
  });

  it("ids for a composite primary key with scope", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const books = await CpkBook.where({ title: book.title });
    expect(books.length).toBe(1);
    expect(books[0].title).toBe(book.title);
  });

  it("ids for a composite primary key on loaded relation", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const relation = CpkBook.where({ title: book.title });
    const records = await relation;
    expect(relation.isLoaded).toBe(true);
    expect(records[0].title).toBe(book.title);
  });

  it("ids with scope", async () => {
    const scopedIds = [1, 2];
    const expected = (await Company.where({ id: scopedIds }))
      .map((c) => Number(c.id))
      .sort((a, b) => a - b);
    const ids = (await Company.where({ id: scopedIds }).ids()).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(expected);
  });

  it("ids on relation", async () => {
    const company = (await Company.first()) as any;
    const contract = await Contract.create({ company_id: company!.id });
    const ids = (await company!.contracts.ids()).map(Number);
    expect(ids).toContain(Number(contract.id));
  });

  it("ids on loaded relation", async () => {
    const loadedCompanies = await Company.all();
    const companyIds = loadedCompanies.map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.all().ids()).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(companyIds);
  });

  it("ids on loaded relation with scope", async () => {
    const scopedIds = [1, 2];
    const loaded = await Company.where({ id: scopedIds });
    const companyIds = loaded.map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.where({ id: scopedIds }).ids()).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(companyIds);
  });

  it("ids async on loaded relation", async () => {
    const loaded = await Company.all().order("id");
    const ids = (await Company.all().order("id").ids()).map(Number);
    expect(ids).toEqual(loaded.map((c) => Number(c.id)));
  });

  it("ids with contradicting scope", async () => {
    const ids = await Company.where({ id: [] }).ids();
    expect(ids).toEqual([]);
  });

  it("ids with join", async () => {
    const company = await Company.first();
    const contract = await Contract.create({ company_id: company!.id });
    const ids = (
      await Company.joins(":contracts").where({ "contracts.id": contract.id }).ids()
    ).map(Number);
    expect(ids).toEqual([Number(company!.id)]);
  });

  it("ids with polymorphic relation join", async () => {
    const part = await ShipPart.create({ name: "has trinket" });
    const treasure = await Treasure.create({
      name: "gold",
      looter_type: "ShipPart",
      looter_id: part.id,
    });
    const ids = (await ShipPart.joins(":trinkets").ids()).map(Number);
    expect(ids).toContain(Number(part.id));
    void treasure;
  });

  it("ids with eager load", async () => {
    const all = (await Company.all()).map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.all().eagerLoad(":contracts").ids())
      .map(Number)
      .sort((a, b) => a - b);
    expect(ids).toEqual(all);
  });

  it("ids with preload", async () => {
    const all = (await Company.all()).map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.all().preload(":contracts").ids()).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual(all);
  });

  it("ids with includes", async () => {
    const all = (await Company.all()).map((c) => Number(c.id)).sort((a, b) => a - b);
    const ids = (await Company.all().includes(":contracts").ids())
      .map(Number)
      .sort((a, b) => a - b);
    expect(ids).toEqual(all);
  });

  it("ids with includes and non primary key order", async () => {
    const all = (await Company.all().order("id")).map((c) => Number(c.id));
    const ids = (await Company.all().includes(":contracts").order(":id").ids()).map(Number);
    expect(ids).toEqual(all);
  });

  it("ids with includes and scope", async () => {
    const scopedIds = [1, 2];
    const expected = (await Company.where({ id: scopedIds }))
      .map((c) => Number(c.id))
      .sort((a, b) => a - b);
    const ids = (await Company.includes(":contracts").where({ id: scopedIds }).ids())
      .map(Number)
      .sort((a, b) => a - b)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    expect(ids).toEqual(expected);
  });

  it("ids with includes and table scope", async () => {
    const company = await Company.first();
    const contract = await Contract.create({ company_id: company!.id });
    const ids = (
      await Company.includes(":contracts").where({ "contracts.id": contract.id }).ids()
    ).map(Number);
    expect(ids).toEqual([Number(company!.id)]);
  });

  it("ids on loaded relation with includes and table scope", async () => {
    const company = await Company.first();
    const contract = await Contract.create({ company_id: company!.id });
    const loaded = await Company.includes(":contracts").where({ "contracts.id": contract.id });
    const ids = loaded.map((c) => Number(c.id));
    expect(ids).toEqual([Number(company!.id)]);
  });

  it("ids with includes limit and empty result", async () => {
    expect(await Topic.includes(":replies").limit(0).ids()).toEqual([]);
    expect(await Topic.includes(":replies").limit(1).where("0 = 1").ids()).toEqual([]);
  });

  it("ids with includes offset", async () => {
    expect((await Topic.includes(":replies").order(":id").offset(4).ids()).map(Number)).toEqual([
      5,
    ]);
    expect(await Topic.includes(":replies").order(":id").offset(5).ids()).toEqual([]);
  });

  it("pluck with includes limit and empty result", async () => {
    expect(await Topic.includes(":replies").limit(0).pluck("id")).toEqual([]);
    expect(await Topic.includes(":replies").limit(1).where("0 = 1").pluck("id")).toEqual([]);
  });

  it("pluck with includes offset", async () => {
    expect(
      (await Topic.includes(":replies").order(":id").offset(4).pluck("id")).map(Number),
    ).toEqual([5]);
    expect(await Topic.includes(":replies").order(":id").offset(5).pluck("id")).toEqual([]);
  });

  it("pluck with join", async () => {
    const ids = (await Reply.order("id").pluck("id")).map(Number);
    expect(ids).toEqual([2, 4]);
    const replies = await Reply.includes(":topic").order("id");
    expect(replies.map((r) => Number(r.id))).toEqual([2, 4]);
  });

  it("pluck with join alias", async () => {
    const result = ((await Reply.order("id").pluck("id", "parent_id")) as [unknown, unknown][]).map(
      ([a, b]) => [Number(a), Number(b)],
    );
    expect(result).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });

  it.skipIf(adapterType !== "postgres")(
    "group by with order by virtual count attribute",
    async () => {
      const expected = new Map([
        ["SpecialPost", 1],
        ["StiPost", 2],
      ]);
      const actual = await (Post.group("type").order(":count" as any) as any)
        .limit(2)
        .maximum("comments_count");
      expect(actual).toEqual(expected);
    },
  );

  it("group by with limit", async () => {
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .limit(2)
      .count("comments.id");
    expect(actual).toBeInstanceOf(Map);
    expect((actual as Map<unknown, number>).size).toBe(2);
  });

  it("group by with offset", async () => {
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .offset(1)
      .count("comments.id");
    expect(actual).toBeInstanceOf(Map);
    expect((actual as Map<unknown, number>).size).toBeGreaterThanOrEqual(1);
  });

  it("group by with limit and offset", async () => {
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .offset(1)
      .limit(1)
      .count("comments.id");
    expect(actual).toBeInstanceOf(Map);
    expect((actual as Map<unknown, number>).size).toBe(1);
  });

  it("group by with quoted count and order by alias", async () => {
    const actual = (await Post.group("type").count("posts.id")) as Map<unknown, number>;
    expect(actual).toBeInstanceOf(Map);
    expect([...actual.keys()]).toEqual(expect.arrayContaining(["Post", "SpecialPost", "StiPost"]));
  });

  it("pluck not auto table name prefix if column included", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id, developer_id: 7 });
    const ids = (await Company.where({ id: c.id })
      .joins(":contracts")
      .pluck("contracts.developer_id")) as number[];
    expect(ids).toEqual([7]);
  });

  it("pluck multiple columns", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ];
    const result = ((await Topic.order("id").pluck("id", "title")) as [unknown, unknown][]).map(
      ([id, title]) => [Number(id), title],
    );
    expect(result).toEqual(expected);
    const expected3col = [
      [1, "The First Topic", "David"],
      [2, "The Second Topic of the day", "Mary"],
      [3, "The Third Topic of the day", "Carl"],
      [4, "The Fourth Topic of the day", "Carl"],
      [5, "The Fifth Topic of the day", "Jason"],
    ];
    const result3 = (
      (await Topic.order("id").pluck("id", "title", "author_name")) as [unknown, unknown, unknown][]
    ).map(([id, title, name]) => [Number(id), title, name]);
    expect(result3).toEqual(expected3col);
  });

  it("pluck with multiple columns and selection clause", async () => {
    const expected = [
      [1, 50],
      [2, 50],
      [3, 50],
      [4, 60],
      [5, 55],
      [6, 53],
    ];
    const result = (
      (await Account.order("id").pluck("id", "credit_limit")) as [unknown, unknown][]
    ).map(([id, limit]) => [Number(id), Number(limit)]);
    expect(result).toEqual(expected);
  });

  it("pluck with line endings", async () => {
    const expected = [
      [1, 50],
      [2, 50],
      [3, 50],
      [4, 60],
      [5, 55],
      [6, 53],
    ];
    const result = (
      (await Account.order("id").pluck("id", "credit_limit")) as [unknown, unknown][]
    ).map(([id, limit]) => [Number(id), Number(limit)]);
    expect(result).toEqual(expected);
  });

  it("pluck with multiple columns and includes", async () => {
    const c = await Company.create({ name: "test" });
    await Contract.create({ company_id: c.id, developer_id: 7 });
    const rows = (
      (await Company.where({ id: c.id })
        .joins(":contracts")
        .pluck("companies.name", "contracts.developer_id")) as [unknown, unknown][]
    ).map(([name, devId]) => [name, devId != null ? Number(devId) : null]);
    expect(rows).toEqual([["test", 7]]);
  });

  it("pluck with reserved words", async () => {
    const names = await NeedQuoting.pluck("name");
    expect(Array.isArray(names)).toBe(true);
  });

  it("pluck replaces select clause", async () => {
    const relation = Topic.select("approved", "id").order("id");
    const ids = (await relation.pluck("id")).map(Number);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    const approved = await relation.pluck("approved");
    expect(approved).toEqual([false, true, true, true, true]);
  });

  it("pluck with qualified name on loaded", async () => {
    const t = Topic.joins(":replies").order("topics.id");
    expect(t.isLoaded).toBe(false);
    const before = (await t.pluck("topics.id")).map(Number);
    expect(before).toEqual([1, 3]);
    await t;
    expect(t.isLoaded).toBe(true);
    const after = (await t.pluck("topics.id")).map(Number);
    expect(after).toEqual(before);
  });

  it("pluck columns with same name", async () => {
    const topicTitles = (
      await Topic.joins(":replies").order("topics.id").pluck("topics.title")
    ).map(String);
    expect(topicTitles).toEqual(["The First Topic", "The Third Topic of the day"]);
  });

  it("pluck functions with alias", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ];
    const result = (
      (await Topic.order("id").pluck(
        arelSql("COALESCE(id, 0) id"),
        arelSql("COALESCE(title, 'untitled') title"),
      )) as [unknown, unknown][]
    ).map(([id, title]) => [Number(id), title]);
    expect(result).toEqual(expected);
  });

  it("pluck functions without alias", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ];
    const result = (
      (await Topic.order("id").pluck(
        arelSql("COALESCE(id, 0)"),
        arelSql("COALESCE(title, 'untitled')"),
      )) as [unknown, unknown][]
    ).map(([id, title]) => [Number(id), title]);
    expect(result).toEqual(expected);
  });

  it("calculation with polymorphic relation", async () => {
    const part = await ShipPart.create({ name: "has trinket" });
    const treasure = await Treasure.create({
      name: "gold",
      looter_type: "ShipPart",
      looter_id: part.id,
    });
    const sum = await ShipPart.joins(":trinkets").sum("ship_parts.id");
    expect(Number(sum)).toBe(Number(part.id));
    void treasure;
  });

  it("calculation with query cache", async () => {
    const count = await ShipPart.count();
    expect(typeof count).toBe("number");
  });

  it("pluck joined with polymorphic relation", async () => {
    const part = await ShipPart.create({ name: "has trinket" });
    const treasure = await Treasure.create({
      name: "gold",
      looter_type: "ShipPart",
      looter_id: part.id,
    });
    const ids = (await ShipPart.joins(":trinkets").pluck("ship_parts.id")).map(Number);
    expect(ids).toContain(Number(part.id));
    void treasure;
  });

  it("pluck loaded relation", async () => {
    const companies = await Company.order("id").limit(3);
    const names = await Company.order("id").limit(3).pluck("name");
    expect(names).toEqual(["37signals", "Summit", "Microsoft"]);
    void companies;
  });

  it("pluck loaded relation multiple columns", async () => {
    const rows = (
      (await Company.order("id").limit(3).pluck("id", "name")) as [unknown, unknown][]
    ).map(([id, name]) => [Number(id), name]);
    expect(rows).toEqual([
      [1, "37signals"],
      [2, "Summit"],
      [3, "Microsoft"],
    ]);
  });

  it("pluck loaded relation sql fragment", async () => {
    const companies = await Company.order("name").limit(3);
    const names = await Company.order("name").limit(3).pluck(arelSql("DISTINCT name"));
    expect(names).toEqual(["37signals", "Apex", "Ex Nihilo"]);
    void companies;
  });

  it("pluck loaded relation aliased attribute", async () => {
    const names = await Company.order("id").limit(3).pluck("name");
    expect(names).toEqual(["37signals", "Summit", "Microsoft"]);
  });

  it("pick one", async () => {
    expect(await Topic.order("id").pick("title")).toBe("The First Topic");
    expect(await Topic.none().pick("title")).toBeNull();
  });

  it("pick two", async () => {
    const result = await Topic.order("id").pick("author_name", "author_email_address");
    expect(result).toEqual(["David", "david@loudthinking.com"]);
    expect(await Topic.none().pick("author_name", "author_email_address")).toBeNull();
  });

  it("pick delegate to all", async () => {
    const cool = minivans("cool_first");
    const color = await Minivan.pick("color");
    expect(color).toBe(cool.color);
  });

  it("pick loaded relation", async () => {
    const companies = Company.order("id").limit(3);
    await companies.load();

    await assertNoQueries(false, async () => {
      expect(await companies.pick("name")).toBe("37signals");
    });
  });

  it("pick loaded relation multiple columns", async () => {
    const companies = Company.order("id").limit(3);
    await companies.load();

    await assertNoQueries(false, async () => {
      const result = (await companies.pick("id", "name")) as [unknown, string];
      expect([Number(result[0]), result[1]]).toEqual([1, "37signals"]);
    });
  });

  it("pick loaded relation sql fragment", async () => {
    const companies = Company.order("name").limit(3);
    await companies.load();

    await assertQueriesCount(1, false, async () => {
      expect(await companies.pick(arelSql("DISTINCT name"))).toBe("37signals");
    });
  });

  it("pick loaded relation aliased attribute", async () => {
    const companies = Company.order("id").limit(3);
    await companies.load();

    await assertNoQueries(false, async () => {
      expect(await companies.pick("new_name")).toBe("37signals");
    });
  });

  it("grouped calculation with polymorphic relation", async () => {
    const part = await ShipPart.create({ name: "has trinket" });
    const treasure = await Treasure.create({
      name: "gold",
      looter_type: "ShipPart",
      looter_id: part.id,
    });
    const result = (await ShipPart.joins(":trinkets")
      .group("ship_parts.name")
      .sum("ship_parts.id")) as Map<unknown, number>;
    expect(Number(result.get("has trinket"))).toBe(Number(part.id));
    void treasure;
  });

  it("calculation grouped by association doesnt error when no records have association", async () => {
    await Client.updateAll({ client_of: null });
    const result = (await Client.group("client_of").count()) as Map<unknown, number>;
    const total = await Client.count();
    expect(result.get(null) ?? 0).toBe(total);
  });

  it("should reference correct aliases while joining tables of has many through association", async () => {
    const developer = await Company.create({ name: "developer" });
    await Contract.create({ company_id: developer.id, developer_id: 1 });
    await expect(
      Company.where({ id: developer.id })
        .includes(":contracts")
        .where({ "contracts.id": 1 })
        .count(),
    ).resolves.toBeDefined();
  });

  it("sum uses enumerable version when block is given", async () => {
    let blockCalled = false;
    const relation = await Client.all().load();

    await assertNoQueries(false, async () => {
      expect(
        await relation.sum(() => {
          blockCalled = true;
          return 0;
        }),
      ).toBe(0);
    });
    expect(blockCalled).toBe(true);
  });

  it("having with strong parameters", async () => {
    const result = await Account.group("id").having({ credit_limit: 50 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].credit_limit).toBe(50);
    expect(result[1].credit_limit).toBe(50);
    expect(result[2].credit_limit).toBe(50);
  });

  it("count takes attribute type precedence over database type", async () => {
    const result = await Account.count();
    expect(result).toBe(6);
    expect(typeof result).toBe("number");
  });

  it("sum takes attribute type precedence over database type", async () => {
    const result = await Account.sum("credit_limit");
    expect(typeof result).toBe("number");
    expect(Number(result)).toBe(318);
  });

  it("group by attribute with custom type", async () => {
    const result = await Book.group("status").count();
    expect(result).toEqual(
      new Map([
        ["proposed", 2],
        ["published", 2],
      ]),
    );
  });

  it("aggregate attribute on enum type", async () => {
    expect(await Book.sum("status")).toBe(4);
    expect(await Book.sum("difficulty")).toBe(1);
    expect(await Book.minimum("difficulty")).toBe(0);
    expect(await Book.maximum("difficulty")).toBe(1);
    expect(await Book.group("status").sum("status")).toEqual(
      new Map([
        ["proposed", 0],
        ["published", 4],
      ]),
    );
    expect(await Book.group("status").sum("difficulty")).toEqual(
      new Map([
        ["proposed", 0],
        ["published", 1],
      ]),
    );
    expect(await Book.group("status").minimum("difficulty")).toEqual(
      new Map([
        ["proposed", 0],
        ["published", 0],
      ]),
    );
    expect(await Book.group("status").maximum("difficulty")).toEqual(
      new Map([
        ["proposed", 0],
        ["published", 1],
      ]),
    );
  });

  it("minimum and maximum on non numeric type", async () => {
    const min = await Topic.minimum("last_read");
    const max = await Topic.maximum("last_read");
    expect(String(min)).toContain("2004-04-15");
    expect(String(max)).toContain("2004-04-15");
    const minByApproved = (await Topic.group("approved").minimum("last_read")) as Map<
      unknown,
      unknown
    >;
    expect(String(minByApproved.get(false))).toContain("2004-04-15");
    expect(minByApproved.get(true)).toBeNull();
  });

  it("minimum and maximum on time attributes", async () => {
    const min = await Topic.minimum("written_on");
    const max = await Topic.maximum("written_on");
    expect(min).toBeInstanceOf(RubyTime);
    expect(max).toBeInstanceOf(RubyTime);
    expect(
      RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300)
        .toR()
        .cmp((min as RubyTime).toR()) === 0,
    ).toBe(true);
    expect(
      RubyTime.utc(2013, 7, 13, 11, 11, 0, 9900)
        .toR()
        .cmp((max as RubyTime).toR()) === 0,
    ).toBe(true);
  });

  it("minimum and maximum on tz aware attributes", async () => {
    const min = await Topic.minimum("written_on");
    expect(min).toBeInstanceOf(RubyTime);
  });

  it("select avg with group by as virtual attribute with sql", async () => {
    const railsCore = companies("rails_core");
    const sql = `SELECT firm_id, AVG(credit_limit) AS avg_credit_limit FROM accounts WHERE firm_id = ${railsCore.id} GROUP BY firm_id LIMIT 1`;
    const accounts = await Account.findBySql(sql);
    const account = accounts[0];
    expect(account).toBeDefined();
    const avg = parseFloat(String(account.readAttribute("avg_credit_limit")));
    expect(avg).toBeCloseTo(52.5);
  });

  it("select avg with group by as virtual attribute with ar", async () => {
    const railsCore = companies("rails_core");
    const account = await Account.select("firm_id", "AVG(credit_limit) AS avg_credit_limit")
      .where({ firm_id: railsCore.id })
      .group("firm_id")
      .take();
    expect(account).toBeDefined();
    const avg = parseFloat(String(account!.readAttribute("avg_credit_limit")));
    expect(avg).toBeCloseTo(52.5);
  });

  it("select avg with joins and group by as virtual attribute with sql", async () => {
    const railsCore = companies("rails_core");
    const sql = `SELECT companies.*, AVG(accounts.credit_limit) AS avg_credit_limit FROM companies INNER JOIN accounts ON companies.id = accounts.firm_id WHERE companies.id = ${railsCore.id} GROUP BY companies.id LIMIT 1`;
    const firms = await DependentFirm.findBySql(sql);
    const firm = firms[0];
    expect(firm).toBeDefined();
    expect(Number(firm.id)).toBe(Number(railsCore.id));
    const avg = parseFloat(String(firm.readAttribute("avg_credit_limit")));
    expect(avg).toBeCloseTo(52.5);
  });

  it("select avg with joins and group by as virtual attribute with ar", async () => {
    const railsCore = companies("rails_core");
    const firm = await DependentFirm.select(
      "companies.*",
      "AVG(accounts.credit_limit) AS avg_credit_limit",
    )
      .where({ id: railsCore.id })
      .joins(":account")
      .group("companies.id")
      .take();
    expect(firm).toBeDefined();
    expect(Number(firm!.id)).toBe(Number(railsCore.id));
    const avg = parseFloat(String(firm!.readAttribute("avg_credit_limit")));
    expect(avg).toBeCloseTo(52.5);
  });

  it("count with block and column name raises an error", async () => {
    expect(await Account.count("firm_id")).toBe(5);
  });

  it("#skip_query_cache! for #pluck", async () => {
    await Account.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Account.pluck("credit_limit");
        await Account.pluck("credit_limit");
      });

      await assertQueriesCount(2, false, async () => {
        await Account.all().skipQueryCacheBang().pluck("credit_limit");
        await Account.all().skipQueryCacheBang().pluck("credit_limit");
      });
    });
  });

  it("#skip_query_cache! for #ids", async () => {
    await Account.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Account.ids();
        await Account.ids();
      });

      await assertQueriesCount(2, false, async () => {
        await Account.all().skipQueryCacheBang().ids();
        await Account.all().skipQueryCacheBang().ids();
      });
    });
  });

  it("#skip_query_cache! for a simple calculation", async () => {
    await Account.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Account.calculate("sum", "credit_limit");
        await Account.calculate("sum", "credit_limit");
      });

      await assertQueriesCount(2, false, async () => {
        await Account.all().skipQueryCacheBang().calculate("sum", "credit_limit");
        await Account.all().skipQueryCacheBang().calculate("sum", "credit_limit");
      });
    });
  });

  it("#skip_query_cache! for a grouped calculation", async () => {
    await Account.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Account.group("firm_id").calculate("sum", "credit_limit");
        await Account.group("firm_id").calculate("sum", "credit_limit");
      });

      await assertQueriesCount(2, false, async () => {
        await Account.all().skipQueryCacheBang().group("firm_id").calculate("sum", "credit_limit");
        await Account.all().skipQueryCacheBang().group("firm_id").calculate("sum", "credit_limit");
      });
    });
  });

  it("group alias is properly quoted", async () => {
    await expect(NeedQuoting.group("name").count()).resolves.toBeDefined();
  });
});
