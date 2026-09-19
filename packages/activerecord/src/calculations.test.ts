import { Time as RubyTime, Temporal } from "@blazetrails/date";
import "./encryption.js";
import { describe, it, expect } from "vitest";
import { sql as arelSql, star as arelStar } from "@blazetrails/arel";
import { TypeError } from "@blazetrails/ruby-compat";
import { assertCalled } from "@blazetrails/activesupport";
import { Result } from "./result.js";
import {
  assert,
  assertPredicate,
  assertNotPredicate,
  assertRaises,
  assertNothingRaised,
  assertNotDeprecated,
  TimeWithZone,
  BigDecimal,
} from "@blazetrails/activesupport";
import { ArgumentError, ForbiddenAttributesError } from "@blazetrails/activemodel";
import { adapterType } from "./test-adapter.js";
import { currentAdapter } from "./support/adapter-helper.js";
import { quoteTableName } from "./support/quote-regex.js";
import { StatementInvalid } from "./errors.js";
import { deprecator } from "./deprecator.js";
import { captureSql } from "./testing/sql-capture.js";
import {
  assertNoQueries,
  assertQueriesCount,
  assertQueriesMatch,
} from "./testing/query-assertions.js";
import { assertAsyncEqual } from "./support/async-helper.js";
import { ProtectedParams } from "./support/stubs/strong-parameters.js";
import { withTimezoneConfig } from "./test-helper.js";
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
import { AuthorAddress } from "./test-helpers/models/author.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { NeedQuoting } from "./test-helpers/models/need-quoting.js";
import { Edge } from "./test-helpers/models/edge.js";
import { Club } from "./test-helpers/models/club.js";
import { Organization } from "./test-helpers/models/organization.js";
import { Possession } from "./test-helpers/models/possession.js";
import { TooLongTableName } from "./test-helpers/models/too-long-table-name.js";
import { Developer, AuditLog } from "./test-helpers/models/developer.js";

type Grouped = Map<unknown, unknown>;

expect.addEqualityTesters([
  function rubyEquals(a: unknown, b: unknown): boolean | undefined {
    const toTime = (x: unknown) => (x instanceof TimeWithZone ? x.utc() : x);
    const ta = toTime(a);
    const tb = toTime(b);
    if (ta instanceof RubyTime && tb instanceof RubyTime) return ta.toR().cmp(tb.toR()) === 0;
    if (a instanceof BigDecimal && typeof b === "number") return Number(a.toString("F")) === b;
    if (b instanceof BigDecimal && typeof a === "number") return Number(b.toString("F")) === a;
    return undefined;
  },
]);

function byRecord(result: unknown, record: { id: unknown }): unknown {
  for (const [key, value] of result as Map<{ id: unknown } | null, unknown>) {
    if (key && key.id === record.id) return value;
  }
  return undefined;
}

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
    expect(await Account.sum("credit_limit")).toEqual(318);
    await assertAsyncEqual(318, Account.asyncSum("credit_limit"));
  });

  it("should sum arel attribute", async () => {
    expect(await Account.sum(Account.arelTable.get("credit_limit"))).toEqual(318);
    await assertAsyncEqual(318, Account.asyncSum(Account.arelTable.get("credit_limit")));
  });

  it("should sum with qualified name on loaded", async () => {
    const accounts = Account.all();

    assertNotPredicate(accounts, (r) => r.isLoaded);
    expect(await accounts.sum("accounts.credit_limit")).toEqual(318);

    await accounts.load();

    assertPredicate(accounts, (r) => r.isLoaded);
    expect(await accounts.sum("accounts.credit_limit")).toEqual(318);
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

    assertNotPredicate(accounts, (r) => r.isLoaded);
    expect(await accounts.count()).toEqual(expected);

    await accounts.load();

    assertPredicate(accounts, (r) => r.isLoaded);
    expect(await accounts.count()).toEqual(expected);
  });

  it("should average field", async () => {
    expect(await Account.average("credit_limit")).toEqual(new BigDecimal("53.0"));
    await assertAsyncEqual(new BigDecimal("53.0"), Account.asyncAverage("credit_limit"));
  });

  it("should average arel attribute", async () => {
    expect(await Account.average(Account.arelTable.get("credit_limit"))).toEqual(
      new BigDecimal("53.0"),
    );
    await assertAsyncEqual(
      new BigDecimal("53.0"),
      Account.asyncAverage(Account.arelTable.get("credit_limit")),
    );
  });

  it("should resolve aliased attributes", async () => {
    expect(await Account.sum("available_credit")).toBe(318);
  });

  it("should return decimal average of integer field", async () => {
    const value = await Account.average("id");

    expect(value).toEqual(new BigDecimal("3.5"));
    expect(value).toBeInstanceOf(BigDecimal);
  });

  it("should return integer average if db returns such", async () => {
    const value = await Book.average("status");

    expect(value).toEqual(new BigDecimal("1.0"));
    expect(value).toBeInstanceOf(BigDecimal);
  });

  it("should return float average if db returns such", async () => {
    await NumericData.create({ temperature: 37.5 });
    let value = await NumericData.average("temperature");

    expect(value).toEqual(37.5);
    expect(Object(value)).toBeInstanceOf(Number);

    if (currentAdapter("PostgreSQLAdapter", "SQLite3Adapter")) {
      await NumericData.create({ temperature: "Infinity" });
      value = await NumericData.average("temperature");

      expect(value).toEqual(Infinity);
      expect(Object(value)).toBeInstanceOf(Number);
    }
  });

  it("should return decimal average if db returns such", async () => {
    await NumericData.create([{ bank_balance: 37.5 }, { bank_balance: 37.45 }]);
    const value = await NumericData.average("bank_balance");

    expect(value).toEqual(new BigDecimal("37.475"));
    expect(value).toBeInstanceOf(BigDecimal);
  });

  it("should return nil as average", async () => {
    expect(await NumericData.average("bank_balance")).toBeNull();
  });

  it("should get maximum of field", async () => {
    expect(await Account.maximum("credit_limit")).toEqual(60);
    await assertAsyncEqual(60, Account.asyncMaximum("credit_limit"));
  });

  it("should get maximum of arel attribute", async () => {
    expect(await Account.maximum(Account.arelTable.get("credit_limit"))).toEqual(60);
    await assertAsyncEqual(60, Account.asyncMaximum(Account.arelTable.get("credit_limit")));
  });

  it("should get maximum of field with include", async () => {
    const relation = Account.where("companies.name != 'Summit'")
      .references("companies")
      .includes(":firm");
    expect(await relation.maximum("credit_limit")).toEqual(55);
    await assertAsyncEqual(55, relation.asyncMaximum("credit_limit"));
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
    expect(await Account.minimum("credit_limit")).toEqual(50);
    await assertAsyncEqual(50, Account.asyncMinimum("credit_limit"));
  });

  it("should get minimum of arel attribute", async () => {
    expect(await Account.minimum(Account.arelTable.get("credit_limit"))).toEqual(50);
    await assertAsyncEqual(50, Account.asyncMinimum(Account.arelTable.get("credit_limit")));
  });

  it("should group by field", async () => {
    const c = (await Account.group("firm_id").sum("credit_limit")) as Grouped;
    for (const firmId of [1, 6, 2]) {
      expect([...c.keys()], `Group ${String(c)} does not contain firm_id ${firmId}`).toContain(
        firmId,
      );
    }
    await assertAsyncEqual(c, Account.group("firm_id").asyncSum("credit_limit"));
  });

  it("should group by arel attribute", async () => {
    const c = (await Account.group(Account.arelTable.get("firm_id")).sum(
      "credit_limit",
    )) as Grouped;
    for (const firmId of [1, 6, 2]) {
      expect([...c.keys()], `Group ${String(c)} does not contain firm_id ${firmId}`).toContain(
        firmId,
      );
    }
  });

  it("should group by multiple fields", async () => {
    const c = await Account.group("firm_id", "credit_limit").count(":all");
    for (const firmAndLimit of [
      [null, 50],
      [1, 50],
      [6, 50],
      [6, 55],
      [9, 53],
      [2, 60],
    ]) {
      expect([...(c as Grouped).keys()]).toContainEqual(firmAndLimit);
    }
  });

  it("should group by multiple fields when table name is too long", async () => {
    for (let i = 0; i < 2; i++) {
      await TooLongTableName.create({
        toooooooo_long_a_id: 1,
        toooooooo_long_b_id: 2,
      });
    }

    const res = await TooLongTableName.group("toooooooo_long_a_id", "toooooooo_long_b_id").count();

    expect(res).toEqual(new Map([[[1, 2], 2]]));
  });

  it("should group by multiple fields having functions", async () => {
    const c = (await Topic.group("author_name", "COALESCE(type, title)").count(":all")) as Grouped;
    const get = (key: unknown[]): unknown =>
      [...c.entries()].find(([k]) => JSON.stringify(k) === JSON.stringify(key))?.[1];
    expect(get(["Carl", "The Third Topic of the day"])).toEqual(1);
    expect(get(["Mary", "Reply"])).toEqual(1);
    expect(get(["David", "The First Topic"])).toEqual(1);
    expect(get(["Carl", "Reply"])).toEqual(1);
  });

  it("should group by summed field", async () => {
    const expected = new Map<unknown, number>([
      [null, 50],
      [1, 50],
      [2, 60],
      [6, 105],
      [9, 53],
    ]);
    expect(await Account.group("firm_id").sum("credit_limit")).toEqual(expected);
  });

  it("group by multiple same field", async () => {
    const accounts = Account.group("firm_id");

    let expected = new Map<unknown, number>([
      [null, 50],
      [1, 50],
      [2, 60],
      [6, 105],
      [9, 53],
    ]);
    expect(await accounts.sum("credit_limit")).toEqual(expected);
    expect(await accounts.mergeBang(accounts).uniqBang("group").sum("credit_limit")).toEqual(
      expected,
    );

    expected = new Map<unknown, number>([
      [null, 50],
      [1, 50],
      [2, 60],
      [6, 55],
      [9, 53],
    ]);

    expect(await accounts.mergeBang(accounts).maximum("credit_limit")).toEqual(expected);

    expected = new Map<unknown, number>([
      [null, 50],
      [1, 50],
      [2, 60],
      [6, 50],
      [9, 53],
    ]);

    expect(await accounts.mergeBang(accounts).minimum("credit_limit")).toEqual(expected);
  });

  it("should generate valid sql with joins and group", async () => {
    await assertNothingRaised(async () => {
      await AuditLog.joins(":developer").group("id").count();
    });
  });

  it("should calculate against given relation", async () => {
    const developer = await Developer.create({ name: "developer" });
    await developer.auditLogs.create({ message: "first log" });
    await developer.auditLogs.create({ message: "second log" });

    const c = (await developer.auditLogs.joins(":developer").group("id").count()) as Grouped;

    expect(c.size).toEqual(await developer.auditLogs.count());
    for (const log of await developer.auditLogs) {
      expect(c.get(log.id)).toEqual(1);
    }
  });

  it("should not use alias for grouped field", async () => {
    await assertQueriesMatch(
      new RegExp(
        `GROUP BY ${quoteTableName("accounts.firm_id").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      ),
      undefined,
      false,
      async () => {
        const c = (await Account.group("firm_id")
          .order("accounts_firm_id")
          .sum("credit_limit")) as Grouped;
        expect([...c.keys()].filter((k) => k != null)).toEqual([1, 2, 6, 9]);
      },
    );
  });

  it("should order by grouped field", async () => {
    const c = (await Account.group("firm_id").order("firm_id").sum("credit_limit")) as Grouped;
    expect([...c.keys()].filter((k) => k != null)).toEqual([1, 2, 6, 9]);
  });

  it("should order by calculation", async () => {
    const c = (await Account.group("firm_id")
      .order("sum_credit_limit desc, firm_id")
      .sum("credit_limit")) as Grouped;
    expect([...c.keys()].map((k) => c.get(k))).toEqual([105, 60, 53, 50, 50]);
    expect([...c.keys()].filter((k) => k != null)).toEqual([6, 2, 9, 1]);
  });

  it("should limit calculation", async () => {
    const c = (await Account.where("firm_id IS NOT NULL")
      .group("firm_id")
      .order("firm_id")
      .limit(2)
      .sum("credit_limit")) as Grouped;
    expect([...c.keys()].filter((k) => k != null)).toEqual([1, 2]);
  });

  it("should limit calculation with offset", async () => {
    const c = (await Account.where("firm_id IS NOT NULL")
      .group("firm_id")
      .order("firm_id")
      .limit(2)
      .offset(1)
      .sum("credit_limit")) as Grouped;
    expect([...c.keys()].filter((k) => k != null)).toEqual([2, 6]);
  });

  it("order should apply before count", async () => {
    const accounts = Account.order({ id: "desc" }).limit(4);

    expect(await accounts.count("firm_id")).toEqual(4);
    expect(await accounts.select("firm_id").count()).toEqual(4);
  });

  it("limit should apply before count", async () => {
    const accounts = Account.order("id").limit(4);

    expect(await accounts.count("firm_id")).toBe(3);
    expect(await accounts.select("firm_id").count()).toBe(3);
  });

  it("limit should apply before count arel attribute", async () => {
    const accounts = Account.order("id").limit(4);

    const firmIdAttribute = Account.arelTable.get("firm_id");
    expect(await accounts.count(firmIdAttribute)).toBe(3);
    expect(await accounts.select(firmIdAttribute).count()).toBe(3);
  });

  it("count should shortcut with limit zero", async () => {
    const accounts = Account.limit(0);

    await assertNoQueries(false, async () => {
      expect(await accounts.count()).toEqual(0);
    });
  });

  it("limit is kept", async () => {
    const queries = await captureSql(async () => {
      await Account.limit(1).count();
    });
    expect(queries.length).toEqual(1);
    expect(queries[0]).toMatch(/LIMIT/);
  });

  it("offset is kept", async () => {
    const queries = await captureSql(async () => {
      await Account.offset(1).count();
    });
    expect(queries.length).toEqual(1);
    expect(queries[0]).toMatch(/OFFSET/);
  });

  it("limit with offset is kept", async () => {
    const queries = await captureSql(async () => {
      await Account.limit(1).offset(1).count();
    });
    expect(queries.length).toEqual(1);
    expect(queries[0]).toMatch(/LIMIT/);
    expect(queries[0]).toMatch(/OFFSET/);
  });

  it("no limit no offset", async () => {
    const queries = await captureSql(async () => {
      await Account.count();
    });
    expect(queries.length).toEqual(1);
    expect(queries[0]).not.toMatch(/LIMIT/);
    expect(queries[0]).not.toMatch(/OFFSET/);
  });

  it("no order by when counting all", async () => {
    const queries = await captureSql(async () => {
      await Account.order({ id: "desc" }).limit(10).count();
    });
    expect(queries.length).toBe(1);
    expect(queries[0]).not.toMatch(/ORDER BY/);
  });

  it("count on invalid columns raises", async () => {
    const error = (await assertRaises([StatementInvalid], {}, async () => {
      await Account.select("credit_limit, firm_name").count();
    })) as StatementInvalid;

    expect(error.sql).toMatch(/accounts/i);
    expect(error.sql).toMatch("credit_limit, firm_name");
  });

  it("apply distinct in count", async () => {
    const queries = await captureSql(async () => {
      await Account.distinct().count();
      await Account.group("firm_id").distinct().count();
    });

    for (const query of queries) {
      expect(query).toMatch(/^SELECT(?! DISTINCT) COUNT\(DISTINCT\b/);
    }
  });

  it("count with eager loading and custom order", async () => {
    const posts = Post.includes(":comments").order("comments.id");
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count()).toEqual(11);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count(":all")).toEqual(11);
    });
  });

  it("count with eager loading and custom select and order", async () => {
    const posts = Post.includes(":comments").order("comments.id").select("type");
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count()).toEqual(11);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count(":all")).toEqual(11);
    });
  });

  it("count with eager loading and custom order and distinct", async () => {
    const posts = Post.includes(":comments").order("comments.id").distinct();
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count()).toEqual(11);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await posts.count(":all")).toEqual(11);
    });
  });

  it("distinct count all with custom select and order", async () => {
    const accounts = Account.distinct()
      .select("credit_limit % 10")
      .order(arelSql("credit_limit % 10"));
    await assertQueriesCount(1, false, async () => {
      expect(await accounts.count(":all")).toEqual(3);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await (await accounts.load()).size()).toEqual(3);
    });
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
    let expected = new Map<unknown, number>([
      [null, 4],
      [1, 1],
      [2, 1],
      [4, 1],
      [5, 1],
      [7, 1],
    ]);
    expect(
      await Post.leftJoins(":comments").group("post_id").distinct().count("author_id"),
    ).toEqual(expected);
    expect(
      await Post.leftJoins(":comments").group("post_id").distinct().select("author_id").count(),
    ).toEqual(expected);
    expect(
      await Post.leftJoins(":comments").group("post_id").count("DISTINCT posts.author_id"),
    ).toEqual(expected);
    expect(
      await Post.leftJoins(":comments").group("post_id").select("DISTINCT posts.author_id").count(),
    ).toEqual(expected);

    expected = new Map<unknown, number>([
      [null, 6],
      [1, 1],
      [2, 1],
      [4, 1],
      [5, 1],
      [7, 1],
    ]);
    expect(await Post.leftJoins(":comments").group("post_id").distinct().count(":all")).toEqual(
      expected,
    );
    expect(
      await Post.leftJoins(":comments")
        .group("post_id")
        .distinct()
        .select("author_id")
        .count(":all"),
    ).toEqual(expected);
  });

  it("distinct count with group by and order and limit", async () => {
    expect(await Account.group("firm_id").distinct().order("1 DESC").limit(1).count()).toEqual(
      new Map([[6, 2]]),
    );
  });

  it("count for a composite primary key model", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    expect(await CpkBook.where({ author_id: book.author_id, id: book.id }).count()).toBe(1);
  });

  it("group by count for a composite primary key model", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const expected = new Map([
      [book.author_id, (await CpkBook.where({ author_id: book.author_id }).count()) as number],
    ]);
    expect(await CpkBook.where({ author_id: book.author_id }).group("author_id").count()).toEqual(
      expected,
    );
  });

  it("count for a composite primary key model with includes and references", async () => {
    expect(await CpkBook.includes(":chapters").references("chapters").count()).toBe(
      await CpkBook.count(),
    );
  });

  it("should group by summed field having condition", async () => {
    const c = (await Account.group("firm_id")
      .having("sum(credit_limit) > 50")
      .sum("credit_limit")) as Grouped;
    expect(c.get(1)).toBeUndefined();
    expect(c.get(6)).toEqual(105);
    expect(c.get(2)).toEqual(60);
  });

  it.skipIf(adapterType === "postgres")(
    "should group by summed field having condition from select",
    async () => {
      const c = (await Account.select("MIN(credit_limit) AS min_credit_limit")
        .group("firm_id")
        .having("min_credit_limit > 50")
        .sum("credit_limit")) as Grouped;
      expect(c.get(1)).toBeUndefined();
      expect(c.get(2)).toBe(60);
      expect(c.get(9)).toBe(53);
    },
  );

  it("should group by summed association", async () => {
    const c = await Account.group("firm").sum("credit_limit");
    expect(byRecord(c, companies("first_firm"))).toBe(50);
    expect(byRecord(c, companies("rails_core"))).toBe(105);
    expect(byRecord(c, companies("first_client"))).toBe(60);
  });

  it("should sum field with conditions", async () => {
    expect(await Account.where("firm_id = 6").sum("credit_limit")).toBe(105);
  });

  it("should return zero if sum conditions return nothing", async () => {
    expect(await Account.where("1 = 2").sum("credit_limit")).toEqual(0);
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    expect(await railsCore.companies.where("1 = 2").sum("id")).toEqual(0);
  });

  it("sum should return valid values for decimals", async () => {
    await NumericData.create({ bank_balance: 19.83 });
    expect(await NumericData.sum("bank_balance")).toEqual(19.83);
  });

  it("should return type casted values with group and expression", async () => {
    expect(
      ((await Account.group("firm_name").sum("0.01 * credit_limit")) as Grouped).get("37signals"),
    ).toEqual(0.5);
  });

  it("should group by summed field with conditions", async () => {
    const c = (await Account.where("firm_id > 1").group("firm_id").sum("credit_limit")) as Grouped;
    expect(c.get(1)).toBeUndefined();
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should group by summed field with conditions and having", async () => {
    const relation = Account.where("firm_id > 1").group("firm_id").having("sum(credit_limit) > 60");
    const c = (await relation.sum("credit_limit")) as Grouped;
    expect(c.get(1)).toBeUndefined();
    expect(c.get(6)).toEqual(105);
    expect(c.get(2)).toBeUndefined();

    await assertAsyncEqual(c, relation.asyncSum("credit_limit"));
  });

  it("should group by fields with table alias", async () => {
    const c = (await Account.group("accounts.firm_id").sum("credit_limit")) as Grouped;
    expect(c.get(1)).toBe(50);
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should calculate grouped with longer field", async () => {
    const c = (await Account.group("firm_id").sum("credit_limit")) as Grouped;
    expect(c.get(1)).toBe(50);
    expect(c.get(6)).toBe(105);
    expect(c.get(2)).toBe(60);
  });

  it("should calculate with invalid field", async () => {
    expect(await Account.calculate("count", "*")).toBe(6);
    expect(await Account.calculate("count", ":all")).toBe(6);
  });

  it("should calculate grouped with invalid field", async () => {
    const c = (await Account.group("accounts.firm_id").count(":all")) as Grouped;
    expect(c.get(1)).toBe(1);
    expect(c.get(6)).toBe(2);
    expect(c.get(2)).toBe(1);
  });

  it("should calculate grouped association with invalid field", async () => {
    const c = await Account.group("firm").count(":all");
    expect(byRecord(c, companies("first_firm"))).toBe(1);
    expect(byRecord(c, companies("rails_core"))).toBe(2);
    expect(byRecord(c, companies("first_client"))).toBe(1);
  });

  it("should group by association with non numeric foreign key", async () => {
    await Speedometer.createBang({ speedometer_id: "ABC" });
    await Minivan.createBang({ minivan_id: "OMG", speedometer_id: "ABC" });

    const c = (await Minivan.group("speedometer").count(":all")) as Grouped;
    const firstKey = [...c.keys()][0] as Speedometer;
    expect(firstKey.constructor).toEqual(Speedometer);
    expect(c.get(firstKey)).toEqual(1);
  });

  it("should calculate grouped association with foreign key option", async () => {
    class AccountWithAnotherFirm extends Account {
      static {
        this.belongsTo("anotherFirm", { className: "Firm", foreignKey: "firm_id" });
      }
    }
    const c = await AccountWithAnotherFirm.group("anotherFirm").count(":all");
    expect(byRecord(c, companies("first_firm"))).toBe(1);
    expect(byRecord(c, companies("rails_core"))).toBe(2);
    expect(byRecord(c, companies("first_client"))).toBe(1);
  });

  it("should calculate grouped by function", async () => {
    const c = (await Company.group(`UPPER(${quoteTableName("type")})`).count(":all")) as Grouped;
    expect(c.get(null)).toBe(2);
    expect(c.get("DEPENDENTFIRM")).toBe(1);
    expect(c.get("CLIENT")).toBe(5);
    expect(c.get("FIRM")).toBe(3);
  });

  it("should calculate grouped by function with table alias", async () => {
    const c = (await Company.group(`UPPER(companies.${quoteTableName("type")})`).count(
      ":all",
    )) as Grouped;
    expect(c.get(null)).toBe(2);
    expect(c.get("DEPENDENTFIRM")).toBe(1);
    expect(c.get("CLIENT")).toBe(5);
    expect(c.get("FIRM")).toBe(3);
  });

  it("should not overshadow enumerable sum", async () => {
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    const someCompanies = railsCore.companies.order("id");

    expect([1, 2, 3].reduce((sum, n) => sum + Math.abs(n), 0)).toEqual(6);
    expect(await someCompanies.sum((c: any) => c.id)).toEqual(15);
    expect(await someCompanies.sum(10, (c: any) => c.id)).toEqual(25);
    await assertRaises([TypeError], {}, async () => {
      await someCompanies.sum((c: any) => c.name);
    });
    expect(await someCompanies.sum("companies: ", (c: any) => c.name)).toEqual(
      "companies: LeetsoftJadedpixel",
    );
  });

  it("should sum scoped field", async () => {
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    expect(await railsCore.companies.sum("id")).toBe(15);
  });

  it("should sum scoped field with from", async () => {
    expect(await Organization.clubs().count()).toEqual(await Club.count());
  });

  it("should sum scoped field with conditions", async () => {
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    expect(await railsCore.companies.where("id > 7").sum("id")).toBe(8);
  });

  it("should group by scoped field", async () => {
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    const c = (await railsCore.companies.group("name").sum("id")) as Grouped;
    expect(c.get("Leetsoft")).toBe(7);
    expect(c.get("Jadedpixel")).toBe(8);
  });

  it("should group by summed field through association and having", async () => {
    const railsCore = (await Company.find(companies("rails_core").id)) as DependentFirm;
    const c = (await railsCore.companies.group("name").having("sum(id) > 7").sum("id")) as Grouped;
    expect(c.get("Leetsoft")).toBeUndefined();
    expect(c.get("Jadedpixel")).toBe(8);
  });

  it("should count selected field with include", async () => {
    expect(await Account.includes(":firm").distinct().count()).toEqual(6);
    expect(await Account.includes(":firm").distinct().select("credit_limit").count()).toEqual(4);
    expect(await Account.includes(":firm").distinct().count("DISTINCT credit_limit")).toEqual(4);
    expect(await Account.includes(":firm").distinct().count("DISTINCT(credit_limit)")).toEqual(4);
  });

  it("should not perform joined include by default", async () => {
    expect(await Account.includes(":firm").count()).toEqual(await Account.count());
    const queries = await captureSql(async () => {
      await Account.includes(":firm").count();
    });
    expect(queries[queries.length - 1]).not.toMatch(/join/i);
  });

  it("should perform joined include when referencing included tables", async () => {
    const joinedCount = await Account.includes(":firm")
      .where({ companies: { name: "37signals" } })
      .count();
    expect(joinedCount).toBe(1);
  });

  it("should count scoped select", async () => {
    await Account.updateAll("credit_limit = NULL");
    expect(await Account.select("credit_limit").count()).toBe(0);
  });

  it("should count scoped select with options", async () => {
    await Account.updateAll("credit_limit = NULL");
    await (await Account.last())!.updateColumns({ credit_limit: 49 });
    await (await Account.first())!.updateColumns({ credit_limit: 51 });

    expect(await Account.select("credit_limit").where("credit_limit >= 50").count()).toBe(1);
  });

  it("should count manual select with include", async () => {
    expect(await Account.select("DISTINCT accounts.id").includes(":firm").count()).toBe(6);
  });

  it("should count manual select with count all", async () => {
    expect(await Account.select("DISTINCT accounts.firm_id").count(":all")).toBe(5);
  });

  it("should count with manual distinct select and distinct", async () => {
    expect(await Account.select("DISTINCT accounts.firm_id").distinct(true).count()).toBe(4);
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
    expect(await Account.count(":all")).toBe(6);
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
    ).toEqual(5);
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

  it("count with distinct", async () => {
    expect(await Account.select("credit_limit").distinct().count()).toBe(4);
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
    const c = (await Account.group("accounts.firm_id")
      .joins(":firm")
      .count("companies.id")) as Grouped;

    for (const firmId of [1, 6, 2, 9]) expect([...c.keys()]).toContain(firmId);
  });

  it("should count field in joined table with group by when tables share column names", async () => {
    assert(Object.hasOwn(Company.columnsHash(), "status"));
    assert(Object.hasOwn(Account.columnsHash(), "status"));

    const counts = await Company.joins(":account").group("accounts.status").count();
    expect(counts).toEqual(
      new Map([
        ["active", 2],
        ["trial", 2],
        ["suspended", 1],
      ]),
    );
  });

  it("should count field of root table with conflicting group by column", async () => {
    const expected = new Map([
      [1, 2],
      [2, 1],
      [4, 5],
      [5, 3],
      [7, 1],
    ]);
    expect(await Post.joins(":comments").group("post_id").count()).toEqual(expected);
    expect(await Post.joins(":comments").group("comments.post_id").count()).toEqual(expected);
    expect(
      await Post.joins(":comments")
        .group("post_id")
        .select("DISTINCT posts.author_id")
        .count(":all"),
    ).toEqual(expected);
  });

  it("count with no parameters isnt deprecated", async () => {
    await assertNotDeprecated(deprecator(), async () => {
      await Account.count();
    });
  });

  it("count with too many parameters raises", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await (Account as any).count(1, 2, 3);
    });
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

  it("count with block", async () => {
    expect(await Account.count((account: Account) => account.credit_limit % 10 === 0)).toBe(4);
  });

  it("count with empty in", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Topic.where({ id: [] }).count()).toEqual(0);
      await assertAsyncEqual(0, Topic.where({ id: [] }).asyncCount());
    });
  });

  it("should sum expression", async () => {
    expect(await Account.sum("2 * credit_limit")).toBe(636);
  });

  it("sum expression returns zero when no records to sum", async () => {
    expect(await Account.where("1 = 2").sum("2 * credit_limit")).toBe(0);
  });

  it("count with from option", async () => {
    expect(await Company.from("companies").count(":all")).toBe(await Company.count(":all"));
    expect(await Account.from("accounts").where("credit_limit = 50").count(":all")).toBe(
      await Account.where("credit_limit = 50").count(":all"),
    );
    expect(await Company.where({ type: "Firm" }).from("companies").count("type")).toBe(
      await Company.where({ type: "Firm" }).count("type"),
    );
  });

  it("sum with from option", async () => {
    expect(await Account.from("accounts").sum("credit_limit")).toBe(
      await Account.sum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").from("accounts").sum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").sum("credit_limit"),
    );
  });

  it("average with from option", async () => {
    expect(await Account.from("accounts").average("credit_limit")).toEqual(
      await Account.average("credit_limit"),
    );
    expect(
      await Account.where("credit_limit > 50").from("accounts").average("credit_limit"),
    ).toEqual(await Account.where("credit_limit > 50").average("credit_limit"));
  });

  it("minimum with from option", async () => {
    expect(await Account.from("accounts").minimum("credit_limit")).toBe(
      await Account.minimum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").from("accounts").minimum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").minimum("credit_limit"),
    );
  });

  it("maximum with from option", async () => {
    expect(await Account.from("accounts").maximum("credit_limit")).toBe(
      await Account.maximum("credit_limit"),
    );
    expect(await Account.where("credit_limit > 50").from("accounts").maximum("credit_limit")).toBe(
      await Account.where("credit_limit > 50").maximum("credit_limit"),
    );
  });

  it("no queries for empty relation on count", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).count()).toEqual(0);
    });
  });

  it("no queries for empty relation on sum", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).sum("tags_count")).toEqual(0);
    });
  });

  it("no queries for empty relation on average", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).average("tags_count")).toBeNull();
    });
  });

  it("no queries for empty relation on minimum", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Account.where({ id: [] }).minimum("id")).toBeNull();
    });
  });

  it("no queries for empty relation on maximum", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Account.where({ id: [] }).maximum("id")).toBeNull();
    });
  });

  it("maximum with not auto table name prefix if column included", async () => {
    await Company.createBang({ name: "test", contracts: [Contract.new({ developer_id: 7 })] });

    expect(await Company.includes(":contracts").maximum("developer_id")).toBe(7);
  });

  it("minimum with not auto table name prefix if column included", async () => {
    await Company.createBang({ name: "test", contracts: [Contract.new({ developer_id: 7 })] });

    expect(await Company.includes(":contracts").minimum("developer_id")).toBe(7);
  });

  it("sum with not auto table name prefix if column included", async () => {
    await Company.createBang({ name: "test", contracts: [Contract.new({ developer_id: 7 })] });

    expect(await Company.includes(":contracts").sum("developer_id")).toBe(7);
  });

  it("sum with grouped calculation", async () => {
    const expected = new Map([
      [0, 0],
      [1, 0],
      [3, 0],
    ]);

    expect(await Post.group("tags_count").sum()).toEqual(expected);
  });

  it("from option with specified index", async () => {
    const edges = Edge.from("edges /*! USE INDEX(unique_edge_index) */");
    expect(await edges.count(":all")).toEqual(await Edge.count(":all"));
    expect(await edges.where("sink_id < 5").count(":all")).toEqual(
      await Edge.where("sink_id < 5").count(":all"),
    );
  });

  it("from option with table different than class", async () => {
    expect(await Company.from("accounts").count(":all")).toBe(await Account.count(":all"));
  });

  it("distinct is honored when used with count operation after group", async () => {
    const approvedTopicsCount = (
      (await Topic.group("approved").count("author_name")) as Grouped
    ).get(true);
    expect(approvedTopicsCount).toBe(4);
    const distinctAuthorsForApprovedCount = (
      (await Topic.group("approved").distinct().count("author_name")) as Grouped
    ).get(true);
    expect(distinctAuthorsForApprovedCount).toBe(3);
  });

  it("pluck", async () => {
    expect(await Topic.order("id").pluck("id")).toEqual([1, 2, 3, 4, 5]);
    await assertAsyncEqual([1, 2, 3, 4, 5], Topic.order("id").asyncPluck("id"));
  });

  it("async pluck on loaded relation", async () => {
    const relation = await Topic.order("id").load();
    await assertAsyncEqual(await relation.pluck("id"), relation.asyncPluck("id"));
  });

  it("async pluck none relation", async () => {
    await assertAsyncEqual([], Topic.none().asyncPluck("id"));
  });

  it("pluck with empty in", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Topic.where({ id: [] }).pluck("id")).toEqual([]);
    });
    await assertAsyncEqual([], Topic.where({ id: [] }).asyncPluck("id"));
  });

  it("pluck without column names", async () => {
    const count = await Company.order("id").limit(1).count();
    expect(count).toBe(1);
  });

  it.skip("pluck type cast", async () => {
    // BLOCKED: pluck-type-cast-min-expression-not-cast
    const topic = topics("first");
    const relation = Topic.where({ id: topic.id });
    expect(await relation.pluck("approved")).toEqual([topic.approved]);
    expect(await relation.pluck("last_read")).toEqual([topic.last_read]);
    expect(await relation.pluck("written_on")).toEqual([topic.written_on]);
    expect(await relation.pluck("min(written_on)", "min(replies_count)")).toEqual([
      [topic.written_on, topic.replies_count],
    ]);
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
    await assertPluckTypeCastWithoutTableNameQualifiedColumn(
      AuthorAddress.joins({ author: "books" }),
    );
  });

  it("pluck type cast with left joins without table name qualified column", async () => {
    await assertPluckTypeCastWithoutTableNameQualifiedColumn(
      AuthorAddress.leftJoins({ author: "books" }),
    );
  });

  it("pluck type cast with eager load without table name qualified column", async () => {
    await assertPluckTypeCastWithoutTableNameQualifiedColumn(
      AuthorAddress.eagerLoad({ author: "books" }),
    );
  });

  it("pluck with type cast does not corrupt the query cache", async () => {
    const topic = topics("first");
    const relation = Topic.where({ id: topic.id });
    await assertQueriesCount(1, false, async () => {
      await Topic.cache(async () => {
        const kind = Object(
          (await (await relation.select("written_on").load()).first())!.readAttributeBeforeTypeCast(
            "written_on",
          ),
        ).constructor;
        await relation.pluck("written_on");
        expect(
          Object(
            (await (
              await relation.select("written_on").load()
            ).first())!.readAttributeBeforeTypeCast("written_on"),
          ),
        ).toBeInstanceOf(kind);
      });
    });
  });

  it("pluck and distinct", async () => {
    expect(await Account.order("credit_limit").distinct().pluck("credit_limit")).toEqual([
      50, 53, 55, 60,
    ]);
  });

  it("pluck in relation", async () => {
    const company = (await Company.first())!;
    const contract = await company.contracts.createBang();
    expect(await company.contracts.pluck("id")).toEqual([contract.id]);
  });

  it("pluck on aliased attribute", async () => {
    expect((await Topic.order("id").pluck("heading"))[0]).toBe("The First Topic");
  });

  it("pluck with serialization", async () => {
    const t = await Topic.createBang({ content: { foo: "bar" } });
    expect(await Topic.where({ id: t.id }).pluck("content")).toEqual([{ foo: "bar" }]);
  });

  it("pluck with qualified column name", async () => {
    expect(await Topic.order("id").pluck("topics.id")).toEqual([1, 2, 3, 4, 5]);
  });

  it("pluck auto table name prefix", async () => {
    const c = await Company.createBang({ name: "test", contracts: [Contract.new()] });
    expect(await Company.joins(":contracts").pluck("id")).toEqual([c.id]);
  });

  it("pluck if table included", async () => {
    const c = await Company.createBang({
      name: "test",
      contracts: [Contract.new({ developer_id: 7 })],
    });
    expect(
      await Company.includes(":contracts")
        .where({ "contracts.id": (await c.contracts.first())!.id })
        .pluck("id"),
    ).toEqual([c.id]);
  });

  it("pluck not auto table name prefix if column joined", async () => {
    const company = await Company.createBang({
      name: "test",
      contracts: [Contract.new({ developer_id: 7 })],
    });
    const metadata = (await company.contracts.first())!.metadata;
    expect(await Company.joins(":contracts").pluck("metadata")).toEqual([metadata]);
  });

  it("pluck with selection clause", async () => {
    expect((await Account.pluck(arelSql("DISTINCT credit_limit"))).sort()).toEqual([
      50, 53, 55, 60,
    ]);
    expect((await Account.pluck(arelSql("DISTINCT accounts.credit_limit"))).sort()).toEqual([
      50, 53, 55, 60,
    ]);
    expect((await Account.pluck(arelSql("DISTINCT(credit_limit)"))).sort()).toEqual([
      50, 53, 55, 60,
    ]);
    expect(await Account.pluck(arelSql("SUM(DISTINCT(credit_limit))"))).toEqual([
      50 + 53 + 55 + 60,
    ]);
  });

  it("pluck with hash argument", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
    ];
    expect(await Topic.order("id").limit(3).pluck("id", { topics: "title" })).toEqual(expected);
    expect(await Topic.order("id").limit(3).pluck("id", { topics: "title" })).toEqual(expected);
    expect(
      await Topic.order("id")
        .limit(3)
        .pluck("id", { topics: ["title"] }),
    ).toEqual(expected);
    expect(
      await Topic.order("id")
        .limit(3)
        .pluck("id", { topics: ["title"] }),
    ).toEqual(expected);
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
    await assertRaises([StatementInvalid], {}, async () => {
      await Topic.pluck({ topics: ["non_existent"] });
    });
  });

  it("ids", async () => {
    expect((await Company.all().ids()).sort()).toEqual(
      (await Company.all()).map((c) => c.id).sort(),
    );
  });

  it("ids for a composite primary key", async () => {
    expect((await CpkBook.all().ids()).sort()).toEqual(
      (await CpkBook.all()).map((b) => b.id).sort(),
    );
  });

  it("pluck for a composite primary key", async () => {
    expect((await CpkBook.all().ids()).sort()).toEqual(
      (await CpkBook.all().pluck(["author_id", "id"])).sort(),
    );
  });

  it("ids for a composite primary key with scope", async () => {
    const book = cpkBooks("cpk_great_author_first_book");

    expect(await CpkBook.all().where({ title: book.title }).ids()).toEqual([book.id]);
  });

  it("ids for a composite primary key on loaded relation", async () => {
    const book = cpkBooks("cpk_great_author_first_book");
    const relation = CpkBook.where({ title: book.title });
    await relation;

    assertPredicate(relation, (r) => r.isLoaded);
    expect(await relation.ids()).toEqual([book.id]);
  });

  it("ids with scope", async () => {
    const scopedIds = [1, 2];
    expect((await Company.where({ id: scopedIds }).ids()).sort()).toEqual(
      (await Company.where({ id: scopedIds })).map((c) => c.id).sort(),
    );
  });

  it("ids on relation", async () => {
    const company = (await Company.first())!;
    const contract = await company.contracts.createBang();
    expect(await company.contracts.ids()).toEqual([contract.id]);
  });

  it("ids on loaded relation", async () => {
    const loadedCompanies = await Company.all().load();
    const companyIds = (await Company.all()).map((c) => c.id);
    await assertQueriesCount(0, false, async () => {
      expect((await loadedCompanies.ids()).sort()).toEqual(companyIds.sort());
    });
  });

  it("ids on loaded relation with scope", async () => {
    const scopedIds = [1, 2];
    const loadedCompanies = await Company.where({ id: scopedIds }).load();
    const companyIds = (await Company.where({ id: scopedIds })).map((c) => c.id);
    await assertQueriesCount(0, false, async () => {
      expect((await loadedCompanies.ids()).sort()).toEqual(companyIds.sort());
    });
  });

  it("ids async on loaded relation", async () => {
    const loadedCompanies = await Company.all().order("id").load();
    await assertAsyncEqual(await loadedCompanies.ids(), loadedCompanies.asyncIds());
  });

  it("ids with contradicting scope", async () => {
    const emptyScopeIds: number[] = [];
    const companyIds = (await Company.where({ id: emptyScopeIds })).map((c) => c.id);
    assertPredicate(companyIds, (ids) => ids.length === 0);
    await assertQueriesCount(0, false, async () => {
      expect(await Company.where({ id: emptyScopeIds }).ids()).toEqual(companyIds);
    });
  });

  it("ids with join", async () => {
    const company = (await Company.first())!;
    await company.contracts.createBang();
    expect(
      await Company.joins(":contracts")
        .where({ "contracts.id": (await company.contracts.first())!.id })
        .ids(),
    ).toEqual([company.id]);
  });

  it("ids with polymorphic relation join", async () => {
    const part = await ShipPart.createBang({ name: "has trinket" });
    await part.trinkets.createBang();

    expect(await ShipPart.joins(":trinkets").ids()).toEqual([part.id]);
    await assertAsyncEqual([part.id], ShipPart.joins(":trinkets").asyncIds());
  });

  it("ids with eager load", async () => {
    const company = (await Company.first())!;
    for (let i = 0; i < 5; i++) await company.contracts.createBang();
    expect((await Company.all().eagerLoad(":contracts").ids()).sort()).toEqual(
      (await Company.all()).map((c) => c.id).sort(),
    );
  });

  it("ids with preload", async () => {
    const company = (await Company.first())!;
    for (let i = 0; i < 5; i++) await company.contracts.createBang();
    expect((await Company.all().preload(":contracts").ids()).sort()).toEqual(
      (await Company.all()).map((c) => c.id).sort(),
    );
  });

  it("ids with includes", async () => {
    const company = (await Company.first())!;
    for (let i = 0; i < 5; i++) await company.contracts.createBang();
    expect((await Company.all().includes(":contracts").ids()).sort()).toEqual(
      (await Company.all()).map((c) => c.id).sort(),
    );
  });

  it("ids with includes and non primary key order", async () => {
    let rating = 1;
    for (const company of await Company.all()) {
      await company.updateBang({ rating: (rating += 1) });
    }
    expect(await Company.includes(":comments").order("rating").ids()).toEqual(
      (await Company.all()).sort((a: any, b: any) => a.rating - b.rating).map((c) => c.id),
    );
  });

  it("ids with includes and scope", async () => {
    const scopedIds = [1, 2];
    const company = (await Company.where({ id: scopedIds }).first())!;
    for (let i = 0; i < 5; i++) await company.contracts.createBang();
    expect((await Company.includes(":contracts").where({ id: scopedIds }).ids()).sort()).toEqual(
      (await Company.where({ id: scopedIds })).map((c) => c.id).sort(),
    );
  });

  it("ids with includes and table scope", async () => {
    const company = (await Company.first())!;
    await company.contracts.createBang();
    expect(
      await Company.includes(":contracts")
        .where({ "contracts.id": (await company.contracts.first())!.id })
        .ids(),
    ).toEqual([company.id]);
  });

  it("ids on loaded relation with includes and table scope", async () => {
    const company = (await Company.first())!;
    await company.contracts.createBang();
    const loadedCompanies = await Company.includes(":contracts")
      .where({ "contracts.id": (await company.contracts.first())!.id })
      .load();
    await assertQueriesCount(0, false, async () => {
      expect(await loadedCompanies.ids()).toEqual([company.id]);
    });
  });

  it("ids with includes limit and empty result", async () => {
    expect(await Topic.includes(":replies").limit(0).ids()).toEqual([]);
    expect(await Topic.includes(":replies").limit(1).where("0 = 1").ids()).toEqual([]);
  });

  it("ids with includes offset", async () => {
    expect(await Topic.includes(":replies").order(":id").offset(4).ids()).toEqual([5]);
    expect(await Topic.includes(":replies").order(":id").offset(5).ids()).toEqual([]);
  });

  it("pluck with includes limit and empty result", async () => {
    expect(await Topic.includes(":replies").limit(0).pluck("id")).toEqual([]);
    expect(await Topic.includes(":replies").limit(1).where("0 = 1").pluck("id")).toEqual([]);
  });

  it("pluck with includes offset", async () => {
    expect(await Topic.includes(":replies").order(":id").offset(4).pluck("id")).toEqual([5]);
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
      const actual = await Post.group("type").order(":count").limit(2).maximum("comments_count");
      expect(actual).toEqual(expected);
    },
  );

  it("group by with limit", async () => {
    const expected = new Map([
      ["StiPost", 3],
      ["SpecialPost", 1],
    ]);
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .limit(2)
      .count("comments.id");
    expect(actual).toEqual(expected);
  });

  it("group by with offset", async () => {
    const expected = new Map([
      ["SpecialPost", 1],
      ["Post", 8],
    ]);
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .offset(1)
      .count("comments.id");
    expect(actual).toEqual(expected);
  });

  it("group by with limit and offset", async () => {
    const expected = new Map([["SpecialPost", 1]]);
    const actual = await Post.includes(":comments")
      .group("type")
      .order({ type: "desc" })
      .offset(1)
      .limit(1)
      .count("comments.id");
    expect(actual).toEqual(expected);
  });

  it("group by with quoted count and order by alias", async () => {
    const expected = new Map([
      ["SpecialPost", 1],
      ["StiPost", 1],
      ["Post", 9],
    ]);
    const actual = await Post.group("type")
      .order("count_posts_id")
      .count(quoteTableName("posts.id"));
    expect(actual).toEqual(expected);
  });

  it("pluck not auto table name prefix if column included", async () => {
    await Company.createBang({ name: "test", contracts: [Contract.new({ developer_id: 7 })] });
    const ids = await Company.includes(":contracts").pluck("developer_id");
    expect(ids.length).toEqual(await Company.count());
    expect(ids.filter((id) => id != null)).toEqual([7]);
  });

  it("pluck multiple columns", async () => {
    expect(await Topic.order("id").pluck("id", "title")).toEqual([
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ]);
    expect(await Topic.order("id").pluck("id", "title", "author_name")).toEqual([
      [1, "The First Topic", "David"],
      [2, "The Second Topic of the day", "Mary"],
      [3, "The Third Topic of the day", "Carl"],
      [4, "The Fourth Topic of the day", "Carl"],
      [5, "The Fifth Topic of the day", "Jason"],
    ]);
  });

  it("pluck with multiple columns and selection clause", async () => {
    expect(await Account.order("id").pluck("id, credit_limit")).toEqual([
      [1, 50],
      [2, 50],
      [3, 50],
      [4, 60],
      [5, 55],
      [6, 53],
    ]);
  });

  it("pluck with line endings", async () => {
    expect(await Account.order("id").pluck("id, credit_limit\n")).toEqual([
      [1, 50],
      [2, 50],
      [3, 50],
      [4, 60],
      [5, 55],
      [6, 53],
    ]);
  });

  it("pluck with multiple columns and includes", async () => {
    await Company.createBang({ name: "test", contracts: [Contract.new({ developer_id: 7 })] });
    const companiesAndDevelopers = await Company.order("companies.id")
      .includes(":contracts")
      .pluck("name", "developer_id");

    expect(companiesAndDevelopers.length).toEqual(await Company.count());
    expect(companiesAndDevelopers[0]).toEqual(["37signals", null]);
    expect(companiesAndDevelopers[companiesAndDevelopers.length - 1]).toEqual(["test", 7]);
  });

  it("pluck with reserved words", async () => {
    await Possession.createBang({ where: "Over There" });

    expect(await Possession.pluck("where")).toEqual(["Over There"]);
  });

  it("pluck replaces select clause", async () => {
    const takesRelation = Topic.select("approved", "id").order("id");
    expect(await takesRelation.pluck("id")).toEqual([1, 2, 3, 4, 5]);
    expect(await takesRelation.pluck("approved")).toEqual([false, true, true, true, true]);
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
    expect(
      await Topic.order("id").pluck(
        arelSql("COALESCE(id, 0) id"),
        arelSql("COALESCE(title, 'untitled') title"),
      ),
    ).toEqual([
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ]);
  });

  it("pluck functions without alias", async () => {
    const expected = [
      [1, "The First Topic"],
      [2, "The Second Topic of the day"],
      [3, "The Third Topic of the day"],
      [4, "The Fourth Topic of the day"],
      [5, "The Fifth Topic of the day"],
    ];

    expect(
      await Topic.order("id").pluck(
        arelSql("COALESCE(id, 0)"),
        arelSql("COALESCE(title, 'untitled')"),
      ),
    ).toEqual(expected);
  });

  it("calculation with polymorphic relation", async () => {
    const part = await ShipPart.createBang({ name: "has trinket" });
    await part.trinkets.createBang();

    expect(await ShipPart.joins(":trinkets").sum("id")).toEqual(part.id);
    await assertAsyncEqual(part.id, ShipPart.joins(":trinkets").asyncSum("id"));
  });

  it("calculation with query cache", async () => {
    await ShipPart.cache(async () => {
      const count = await ShipPart.count();
      await assertAsyncEqual(count, ShipPart.asyncCount());
    });

    await ShipPart.cache(async () => {
      const count = ShipPart.asyncCount();
      await assertAsyncEqual(await count, ShipPart.asyncCount());
    });
  });

  it("pluck joined with polymorphic relation", async () => {
    const part = await ShipPart.createBang({ name: "has trinket" });
    await part.trinkets.createBang();

    expect(await ShipPart.joins(":trinkets").pluck("id")).toEqual([part.id]);
    await assertAsyncEqual([part.id], ShipPart.joins(":trinkets").asyncPluck("id"));
  });

  it("pluck loaded relation", async () => {
    const companies = await Company.order("id").limit(3).load();

    await assertQueriesCount(0, false, async () => {
      expect(await companies.pluck("name")).toEqual(["37signals", "Summit", "Microsoft"]);
    });
  });

  it("pluck loaded relation multiple columns", async () => {
    const companies = await Company.order("id").limit(3).load();

    await assertQueriesCount(0, false, async () => {
      expect(await companies.pluck("id", "name")).toEqual([
        [1, "37signals"],
        [2, "Summit"],
        [3, "Microsoft"],
      ]);
    });
  });

  it("pluck loaded relation sql fragment", async () => {
    const companies = await Company.order("name").limit(3).load();

    await assertQueriesCount(1, false, async () => {
      expect(await companies.pluck(arelSql("DISTINCT name"))).toEqual([
        "37signals",
        "Apex",
        "Ex Nihilo",
      ]);
    });
  });

  it("pluck loaded relation aliased attribute", async () => {
    const companies = await Company.order("id").limit(3).load();

    await assertQueriesCount(0, false, async () => {
      expect(await companies.pluck("new_name")).toEqual(["37signals", "Summit", "Microsoft"]);
    });
  });

  it("pick one", async () => {
    expect(await Topic.order("id").pick("heading")).toEqual("The First Topic");
    await assertNoQueries(false, async () => {
      expect(await Topic.none().pick("heading")).toBeNull();
      expect(await Topic.where({ id: 9999999999999999999n }).pick("heading")).toBeNull();
    });

    await assertAsyncEqual("The First Topic", Topic.order("id").asyncPick("heading"));
  });

  it("pick two", async () => {
    expect(await Topic.order("id").pick("author_name", "author_email_address")).toEqual([
      "David",
      "david@loudthinking.com",
    ]);
    await assertNoQueries(false, async () => {
      expect(await Topic.none().pick("author_name", "author_email_address")).toBeNull();
      expect(
        await Topic.where({ id: 9999999999999999999n }).pick("author_name", "author_email_address"),
      ).toBeNull();
    });

    await assertAsyncEqual(
      ["David", "david@loudthinking.com"],
      Topic.order("id").asyncPick("author_name", "author_email_address"),
    );
  });

  it("pick delegate to all", async () => {
    const coolFirst = minivans("cool_first");
    expect(await Minivan.pick("color")).toBe(coolFirst.color);
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
      expect(await companies.pick("id", "name")).toEqual([1, "37signals"]);
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
    const part = await ShipPart.createBang({ name: "has trinket" });
    await part.trinkets.createBang();

    expect(await ShipPart.joins(":trinkets").group("ship_parts.name").sum("id")).toEqual(
      new Map([["has trinket", part.id]]),
    );
  });

  it("calculation grouped by association doesnt error when no records have association", async () => {
    await Client.updateAll({ client_of: null });
    expect(await Client.group("firm").count()).toEqual(new Map([[null, await Client.count()]]));
  });

  it("should reference correct aliases while joining tables of has many through association", async () => {
    await assertNothingRaised(async () => {
      const developer = await Developer.createBang({ name: "developer" });
      await developer.ratings
        .includes({ comment: "post" })
        .where({ posts: { id: 1 } })
        .count();
    });
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
      ).toEqual(0);
    });
    assert(blockCalled);
  });

  it("having with strong parameters", async () => {
    const params = new ProtectedParams({ credit_limit: "50" });

    await assertRaises([ForbiddenAttributesError], {}, async () => {
      Account.group("id").having(params);
    });

    const result = await Account.group("id").having(params.permitBang());
    expect(result[0].credit_limit).toEqual(50);
    expect(result[1].credit_limit).toEqual(50);
    expect(result[2].credit_limit).toEqual(50);
  });

  it("count takes attribute type precedence over database type", async () => {
    await assertCalled(
      await Account.leaseConnection(),
      "selectAll",
      null,
      { returns: Promise.resolve(new Result(["count"], [["10"]])) },
      async () => {
        const result = await Account.count();
        expect(result).toBe(10);
        expect(typeof result).toBe("number");
      },
    );
  });

  it("sum takes attribute type precedence over database type", async () => {
    await assertCalled(
      await Account.leaseConnection(),
      "selectAll",
      null,
      { returns: Promise.resolve(new Result(["sum"], [[10]])) },
      async () => {
        const result = await Account.sum("credit_limit");
        expect(result).toBe(10);
        expect(typeof result).toBe("number");
      },
    );
  });

  it("group by attribute with custom type", async () => {
    expect(await Book.group("status").count()).toEqual(
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
    const date = Temporal.PlainDate.from({ year: 2004, month: 4, day: 15 });
    expect(await Topic.minimum("last_read")).toEqual(date);
    expect(await Topic.maximum("last_read")).toEqual(date);
    expect(await Topic.group("approved").minimum("last_read")).toEqual(
      new Map<unknown, unknown>([
        [false, date],
        [true, null],
      ]),
    );
    expect(await Topic.group("approved").maximum("last_read")).toEqual(
      new Map<unknown, unknown>([
        [false, date],
        [true, null],
      ]),
    );
  });

  it("minimum and maximum on time attributes", async () => {
    await assertMinimumAndMaximumOnTimeAttributes(RubyTime);
  });

  it("minimum and maximum on tz aware attributes", async () => {
    try {
      await withTimezoneConfig(
        { awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          await Topic.resetColumnInformation();
          await assertMinimumAndMaximumOnTimeAttributes(TimeWithZone);
        },
      );
    } finally {
      await Topic.resetColumnInformation();
    }
  });

  it("select avg with group by as virtual attribute with sql", async () => {
    const railsCore = companies("rails_core");

    const sql = `SELECT firm_id, AVG(credit_limit) AS avg_credit_limit
FROM accounts
WHERE firm_id = ?
GROUP BY firm_id
LIMIT 1
`;

    const account = (await Account.findBySql([sql, railsCore.id]))[0] as Account & {
      avg_credit_limit: unknown;
    };

    expect(account.id).toBeNull();

    expect((await account.firm)!.id).toEqual(railsCore.id);

    expect(account.avg_credit_limit).toEqual(52.5);
  });

  it("select avg with group by as virtual attribute with ar", async () => {
    const railsCore = companies("rails_core");

    const account = (await Account.select("firm_id", "AVG(credit_limit) AS avg_credit_limit")
      .where({ firm: railsCore })
      .group("firm_id")
      .takeBang()) as Account & { avg_credit_limit: unknown };

    expect(account.id).toBeNull();

    expect((await account.firm)!.id).toEqual(railsCore.id);

    expect(account.avg_credit_limit).toEqual(52.5);
  });

  it("select avg with joins and group by as virtual attribute with sql", async () => {
    const railsCore = companies("rails_core");

    const sql = `SELECT companies.*, AVG(accounts.credit_limit) AS avg_credit_limit
FROM companies
INNER JOIN accounts ON companies.id = accounts.firm_id
WHERE companies.id = ?
GROUP BY companies.id
LIMIT 1
`;

    const firm = (await DependentFirm.findBySql([sql, railsCore.id]))[0] as DependentFirm & {
      avg_credit_limit: unknown;
    };

    expect(firm.id).toEqual(railsCore.id);
    expect(firm.name).toEqual(railsCore.name);

    expect(firm.avg_credit_limit).toEqual(52.5);
  });

  it("select avg with joins and group by as virtual attribute with ar", async () => {
    const railsCore = companies("rails_core");

    const firm = (await DependentFirm.select(
      "companies.*",
      "AVG(accounts.credit_limit) AS avg_credit_limit",
    )
      .where({ id: railsCore.id })
      .joins(":account")
      .group("id")
      .takeBang()) as DependentFirm & { avg_credit_limit: unknown };

    expect(firm.id).toEqual(railsCore.id);
    expect(firm.name).toEqual(railsCore.name);

    expect(firm.avg_credit_limit).toEqual(52.5);
  });

  it("count with block and column name raises an error", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await Account.count("firm_id", () => true);
    });
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
    await assertNothingRaised(async () => {
      await NeedQuoting.group("name").count();
    });
  });
});

async function assertPluckTypeCastWithoutTableNameQualifiedColumn(authorAddresses: any) {
  const expected = [
    [null, "unread"],
    ["ebook", "reading"],
    ["paperback", "read"],
  ];
  const actual = await authorAddresses
    .order("last_read")
    .where({ "books.last_read": ["unread", "reading", "read"] })
    .pluck("format", "last_read");

  expect(actual).toEqual(expected);
}

async function assertMinimumAndMaximumOnTimeAttributes(timeClass: unknown) {
  let actual: any = await Topic.minimum("written_on");
  expect(actual).toEqual(RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300));
  expect(actual).toBeInstanceOf(timeClass);

  actual = await Topic.maximum("written_on");
  expect(actual).toEqual(RubyTime.utc(2013, 7, 13, 11, 11, 0, 9900));
  expect(actual).toBeInstanceOf(timeClass);

  let expected = new Map<unknown, unknown>([
    [false, RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300)],
    [true, RubyTime.utc(2004, 7, 15, 14, 28, 0, 9900)],
  ]);
  actual = await Topic.group("approved").minimum("written_on");
  expect(actual).toEqual(expected);
  expect(actual.get(true)).toBeInstanceOf(timeClass);
  expect(actual.get(true)).toBeInstanceOf(timeClass);

  expected = new Map<unknown, unknown>([
    [false, RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300)],
    [true, RubyTime.utc(2013, 7, 13, 11, 11, 0, 9900)],
  ]);
  actual = await Topic.group("approved").maximum("written_on");
  expect(actual).toEqual(expected);
  expect(actual.get(true)).toBeInstanceOf(timeClass);
  expect(actual.get(true)).toBeInstanceOf(timeClass);

  await assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn(timeClass, "topics.written_on");
  await assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn(timeClass, "written_on");
}

async function assertMinimumAndMaximumOnTimeAttributesJoinsWithColumn(
  timeClass: unknown,
  column: string,
) {
  let actual: any = await Author.joins(":topics").maximum(column);
  expect(actual).toEqual(RubyTime.utc(2004, 7, 15, 14, 28, 0, 9900));
  expect(actual).toBeInstanceOf(timeClass);

  actual = await Author.joins(":topics").minimum(column);
  expect(actual).toEqual(RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300));
  expect(actual).toBeInstanceOf(timeClass);

  const expected = new Map<unknown, unknown>([
    [1, RubyTime.utc(2003, 7, 16, 14, 28, 11, 223300)],
    [2, RubyTime.utc(2004, 7, 15, 14, 28, 0, 9900)],
  ]);

  actual = await Author.joins(":topics").group("id").maximum(column);
  expect(actual).toEqual(expected);
  expect(actual.get(1)).toBeInstanceOf(timeClass);
  expect(actual.get(2)).toBeInstanceOf(timeClass);

  actual = await Author.joins(":topics").group("id").minimum(column);
  expect(actual).toEqual(expected);
  expect(actual.get(1)).toBeInstanceOf(timeClass);
  expect(actual.get(2)).toBeInstanceOf(timeClass);
}
