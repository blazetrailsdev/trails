import { describe, it, expect } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { Base, Range, PreparedStatementInvalid, UnknownAttributeReference } from "./index.js";
import type { Relation } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";
import { Author } from "./test-helpers/models/author.js";
import { Binary } from "./test-helpers/models/binary.js";
import { Post } from "./test-helpers/models/post.js";
import { currentAdapter } from "./support/adapter-helper.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";

fixtures({});

function bind(statement: string, ...vars: unknown[]): string {
  return Base.sanitizeSqlArray(statement, ...vars);
}

class SimpleEnumerable {
  private ary: unknown[];

  constructor(ary: unknown[]) {
    this.ary = ary;
  }

  *each(): Generator<unknown> {
    yield* this.ary;
  }

  map<R>(b: (value: unknown) => R): R[] {
    return this.ary.map(b);
  }
}

describe("SanitizeTest", () => {
  it("sanitize sql array handles string interpolation", async () => {
    const quotedBambi = (await Base.leaseConnection()).quoteString("Bambi");
    expect(Binary.sanitizeSqlArray("name='%s'", "Bambi")).toBe(`name='${quotedBambi}'`);
    expect(Binary.sanitizeSqlArray("name='%s'", "Bambi")).toBe(`name='${quotedBambi}'`);
    const quotedBambiAndThumper = (await Base.leaseConnection()).quoteString("Bambi\nand\nThumper");
    expect(Binary.sanitizeSqlArray("name='%s'", "Bambi\nand\nThumper")).toBe(
      `name='${quotedBambiAndThumper}'`,
    );
    expect(Binary.sanitizeSqlArray("name='%s'", "Bambi\nand\nThumper")).toBe(
      `name='${quotedBambiAndThumper}'`,
    );
  });

  it("sanitize sql array handles bind variables", async () => {
    const quotedBambi = (await Base.leaseConnection()).quote("Bambi");
    expect(Binary.sanitizeSqlArray("name=?", "Bambi")).toBe(`name=${quotedBambi}`);
    expect(Binary.sanitizeSqlArray("name=?", "Bambi")).toBe(`name=${quotedBambi}`);
    const quotedBambiAndThumper = (await Base.leaseConnection()).quote("Bambi\nand\nThumper");
    expect(Binary.sanitizeSqlArray("name=?", "Bambi\nand\nThumper")).toBe(
      `name=${quotedBambiAndThumper}`,
    );
    expect(Binary.sanitizeSqlArray("name=?", "Bambi\nand\nThumper")).toBe(
      `name=${quotedBambiAndThumper}`,
    );
  });

  it("sanitize sql array handles named bind variables", async () => {
    const quotedBambi = (await Base.leaseConnection()).quote("Bambi");
    expect(Binary.sanitizeSqlArray("name=:name", { name: "Bambi" })).toBe(`name=${quotedBambi}`);
    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(Binary.sanitizeSqlArray("name=:name AND id=:id", { name: "Bambi", id: 1 })).toBe(
        `name=${quotedBambi} AND id='1'`,
      );
    } else {
      expect(Binary.sanitizeSqlArray("name=:name AND id=:id", { name: "Bambi", id: 1 })).toBe(
        `name=${quotedBambi} AND id=1`,
      );
    }

    const quotedBambiAndThumper = (await Base.leaseConnection()).quote("Bambi\nand\nThumper");
    expect(Binary.sanitizeSqlArray("name=:name", { name: "Bambi\nand\nThumper" })).toBe(
      `name=${quotedBambiAndThumper}`,
    );
    expect(
      Binary.sanitizeSqlArray("name=:name AND name2=:name", { name: "Bambi\nand\nThumper" }),
    ).toBe(`name=${quotedBambiAndThumper} AND name2=${quotedBambiAndThumper}`);
  });

  it("sanitize sql array handles relations", async () => {
    const david = await Author.createBang({ name: "David" });
    const davidPosts = david.posts.select("id");

    const subQueryPattern = /\(\bselect\b.*?\bwhere\b.*?\)/i;

    let selectAuthorSql = Post.sanitizeSqlArray("id in (?)", davidPosts);
    expect(selectAuthorSql).toMatch(subQueryPattern);

    selectAuthorSql = Post.sanitizeSqlArray("id in (:post_ids)", { post_ids: davidPosts });
    expect(selectAuthorSql).toMatch(subQueryPattern);
  });

  it("sanitize sql array handles empty statement", () => {
    const selectAuthorSql = Post.sanitizeSqlArray("");
    expect(selectAuthorSql).toBe("");
  });

  it("sanitize sql like", () => {
    expect(Binary.sanitizeSqlLike("100%")).toBe("100\\%");
    expect(Binary.sanitizeSqlLike("snake_cased_string")).toBe("snake\\_cased\\_string");
    expect(Binary.sanitizeSqlLike("C:\\Programs\\MsPaint")).toBe("C:\\\\Programs\\\\MsPaint");
    expect(Binary.sanitizeSqlLike("normal string 42")).toBe("normal string 42");
  });

  it("sanitize sql like with custom escape character", () => {
    expect(Binary.sanitizeSqlLike("100%", "!")).toBe("100!%");
    expect(Binary.sanitizeSqlLike("snake_cased_string", "!")).toBe("snake!_cased!_string");
    expect(Binary.sanitizeSqlLike("great!", "!")).toBe("great!!");
    expect(Binary.sanitizeSqlLike("C:\\Programs\\MsPaint", "!")).toBe("C:\\Programs\\MsPaint");
    expect(Binary.sanitizeSqlLike("normal string 42", "!")).toBe("normal string 42");
  });

  it("sanitize sql like with wildcard as escape character", () => {
    expect(Binary.sanitizeSqlLike("1_000%", "_")).toBe("1__000_%");
    expect(Binary.sanitizeSqlLike("1_000%", "%")).toBe("1%_000%%");
  });

  // BLOCKED: inheritance — Rails' Class.new(Post) has sti_name nil (inheritance.rb:187), so type_condition is `type IS NULL` and the LIKE bind is $1; trails' stiName returns "" so it binds, shifting LIKE to $2 on PostgreSQL — sti-name-of-anonymous-class-should-be-nil.
  it.skip("sanitize sql like example use case", async () => {
    class SearchablePost extends Post {
      static searchAsMethod(term: string) {
        return this.where("title LIKE ?", this.sanitizeSqlLike(term, "!"));
      }
      declare static searchAsScope: (term: string) => Relation<SearchablePost>;
    }
    SearchablePost.scope("searchAsScope", function (this: Relation<SearchablePost>, term: string) {
      return this.where("title LIKE ?", this.sanitizeSqlLike(term, "!"));
    });

    const query = (await SearchablePost.leaseConnection()).preparedStatements
      ? currentAdapter("PostgreSQLAdapter")
        ? /title LIKE \$1/
        : /title LIKE \?/
      : /LIKE '20!% !_reduction!_!!'/;

    await assertQueriesMatch(query, undefined, false, async () => {
      await SearchablePost.searchAsMethod("20% _reduction_!");
    });

    await assertQueriesMatch(query, undefined, false, async () => {
      await SearchablePost.searchAsScope("20% _reduction_!");
    });
  });

  it("disallow raw sql with unknown attribute string", async () => {
    await assertRaises([UnknownAttributeReference], {}, () =>
      Binary.disallowRawSqlBang(["field(id, ?)"]),
    );
  });

  it("disallow raw sql with unknown attribute sql literal", async () => {
    await assertNothingRaised(() => Binary.disallowRawSqlBang([arelSql("field(id, ?)")]));
  });

  it("bind arity", async () => {
    await assertNothingRaised(() => bind(""));
    await assertRaises([PreparedStatementInvalid], {}, () => bind("", 1));

    await assertRaises([PreparedStatementInvalid], {}, () => bind("?"));
    await assertNothingRaised(() => bind("?", 1));
    await assertRaises([PreparedStatementInvalid], {}, () => bind("?", 1, 1));
  });

  it("named bind variables", async () => {
    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind(":a", { a: 1 })).toBe("'1'");
      expect(bind(":a :a", { a: 1 })).toBe("'1' '1'");
    } else {
      expect(bind(":a", { a: 1 })).toBe("1");
      expect(bind(":a :a", { a: 1 })).toBe("1 1");
    }

    await assertNothingRaised(() => bind("'+00:00'", { foo: "bar" }));
  });

  it("named bind arity", async () => {
    await assertNothingRaised(() => bind("name = :name", { name: "37signals" }));
    await assertNothingRaised(() => bind("name = :name", { name: "37signals", id: 1 }));
    await assertRaises([PreparedStatementInvalid], {}, () => bind("name = :name", { id: 1 }));
  });

  // BLOCKED: sanitization — sanitization.ts:321 narrows sanitization.rb:191's `respond_to?(:map)` duck test to Array|Set, so a Ruby-Enumerable value raises `can't quote <Class>` — sanitize-quote-bound-value-enumerable-duck-test.
  it.skip("bind enumerable", async () => {
    const connection = await Base.leaseConnection();
    const quotedAbc = `${connection.quote("a")},${connection.quote("b")},${connection.quote("c")}`;

    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind("?", [1, 2, 3])).toBe("'1','2','3'");
    } else {
      expect(bind("?", [1, 2, 3])).toBe("1,2,3");
    }
    expect(bind("?", ["a", "b", "c"])).toBe(quotedAbc);

    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind(":a", { a: [1, 2, 3] })).toBe("'1','2','3'");
    } else {
      expect(bind(":a", { a: [1, 2, 3] })).toBe("1,2,3");
    }
    expect(bind(":a", { a: ["a", "b", "c"] })).toBe(quotedAbc);

    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind("?", new SimpleEnumerable([1, 2, 3]))).toBe("'1','2','3'");
    } else {
      expect(bind("?", new SimpleEnumerable([1, 2, 3]))).toBe("1,2,3");
    }
    expect(bind("?", new SimpleEnumerable(["a", "b", "c"]))).toBe(quotedAbc);

    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind(":a", { a: new SimpleEnumerable([1, 2, 3]) })).toBe("'1','2','3'");
    } else {
      expect(bind(":a", { a: new SimpleEnumerable([1, 2, 3]) })).toBe("1,2,3");
    }
    expect(bind(":a", { a: new SimpleEnumerable(["a", "b", "c"]) })).toBe(quotedAbc);
  });

  it("bind empty enumerable", async () => {
    const quotedNil = (await Base.leaseConnection()).quote(null);
    expect(bind("?", [])).toBe(quotedNil);
    expect(bind(" in (?)", [])).toBe(` in (${quotedNil})`);
    expect(bind("foo in (?)", [])).toBe(`foo in (${quotedNil})`);
  });

  // BLOCKED: sanitization — sanitization.ts:321 narrows sanitization.rb:191's `respond_to?(:map)` duck test to Array|Set, so a Ruby-Enumerable value raises `can't quote <Class>` — sanitize-quote-bound-value-enumerable-duck-test.
  it.skip("bind range", async () => {
    const connection = await Base.leaseConnection();
    const quotedAbc = `${connection.quote("a")},${connection.quote("b")},${connection.quote("c")}`;
    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
      expect(bind("?", new Range(0, 0))).toBe("'0'");
      expect(bind("?", new Range(1, 3))).toBe("'1','2','3'");
    } else {
      expect(bind("?", new Range(0, 0))).toBe("0");
      expect(bind("?", new Range(1, 3))).toBe("1,2,3");
    }
    expect(bind("?", new Range("a", "d", true))).toBe(quotedAbc);
  });

  // BLOCKED: sanitization — sanitization.ts:321 narrows sanitization.rb:191's `respond_to?(:map)` duck test to Array|Set, so a Ruby-Enumerable value raises `can't quote <Class>` — sanitize-quote-bound-value-enumerable-duck-test.
  it.skip("bind empty range", async () => {
    const quotedNil = (await Base.leaseConnection()).quote(null);
    expect(bind("?", new Range(0, 0, true))).toBe(quotedNil);
    expect(bind("?", new Range("a", "a", true))).toBe(quotedNil);
  });

  it("bind empty string", async () => {
    const quotedEmpty = (await Base.leaseConnection()).quote("");
    expect(bind("?", "")).toBe(quotedEmpty);
  });

  it("bind chars", async () => {
    const connection = await Base.leaseConnection();
    const quotedBambi = connection.quote("Bambi");
    const quotedBambiAndThumper = connection.quote("Bambi\nand\nThumper");
    expect(bind("name=?", "Bambi")).toBe(`name=${quotedBambi}`);
    expect(bind("name=?", "Bambi\nand\nThumper")).toBe(`name=${quotedBambiAndThumper}`);
    expect(bind("name=?", "Bambi")).toBe(`name=${quotedBambi}`);
    expect(bind("name=?", "Bambi\nand\nThumper")).toBe(`name=${quotedBambiAndThumper}`);
  });

  it("named bind with postgresql type casts", async () => {
    const l = () => bind(":a::integer '2009-01-01'::date", { a: "10" });
    await assertNothingRaised(l);
    expect(l()).toBe(`${(await Base.leaseConnection()).quote("10")}::integer '2009-01-01'::date`);
  });

  it("named bind with literal colons", async () => {
    expect(
      bind("TO_TIMESTAMP(:date, 'YYYY/MM/DD HH12\\:MI\\:SS')", { date: "2017/08/02 10:59:00" }),
    ).toBe("TO_TIMESTAMP('2017/08/02 10:59:00', 'YYYY/MM/DD HH12:MI:SS')");
    await assertRaises([PreparedStatementInvalid], {}, () =>
      bind("TO_TIMESTAMP(:date, 'YYYY/MM/DD HH12:MI:SS')", { date: "2017/08/02 10:59:00" }),
    );
  });
});
