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

  it("sanitize sql like example use case", async () => {
    class SearchablePost extends Post {
      static searchAsMethod(term: string) {
        return this.where("title LIKE ?", this.sanitizeSqlLike(term, "!"));
      }
      declare static searchAsScope: (term: string) => Relation<SearchablePost>;
    }
    SearchablePost.scope("searchAsScope", (term: string) =>
      SearchablePost.where("title LIKE ?", SearchablePost.sanitizeSqlLike(term, "!")),
    );

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
describe("sanitizeSql", () => {
  it.skip("sanitizeSqlArray replaces ? placeholders with quoted values", () => {
    class User extends Base {
      static _tableName = "users";
    }

    expect(User.sanitizeSqlArray("name = ?", "Alice")).toBe("name = 'Alice'");
    expect(User.sanitizeSqlArray("age > ?", 18)).toBe("age > 18");
    expect(User.sanitizeSqlArray("name = ? AND age > ?", "Bob", 25)).toBe(
      "name = 'Bob' AND age > 25",
    );
    expect(User.sanitizeSqlArray("active = ?", true)).toBe("active = TRUE");
    expect(User.sanitizeSqlArray("deleted_at = ?", null)).toBe("deleted_at = NULL");
  });

  it("sanitizeSqlArray escapes single quotes", () => {
    class User extends Base {
      static _tableName = "users";
    }
    const a = User.connection;
    expect(User.sanitizeSqlArray("name = ?", "O'Brien")).toBe(`name = ${a.quote("O'Brien")}`);
  });

  it("sanitizeSql handles string passthrough", () => {
    class User extends Base {
      static _tableName = "users";
    }

    expect(User.sanitizeSql("name = 'Alice'")).toBe("name = 'Alice'");
  });

  it("sanitizeSql returns null for blank input (Rails alias of sanitize_sql_for_conditions)", () => {
    class User extends Base {
      static _tableName = "users";
    }
    expect(User.sanitizeSql("")).toBeNull();
    expect(User.sanitizeSql("   ")).toBeNull();
    expect(User.sanitizeSql([] as unknown as [string, ...unknown[]])).toBeNull();
  });

  it("sanitizeSql handles array format", () => {
    class User extends Base {
      static _tableName = "users";
    }
    const a = User.connection as unknown as {
      castBoundValue(v: unknown): unknown;
      quote(v: unknown): string;
    };
    expect(User.sanitizeSql(["name = ? AND age > ?", "Alice", 30])).toBe(
      `name = ${a.quote(a.castBoundValue("Alice"))} AND age > ${a.quote(a.castBoundValue(30))}`,
    );
  });

  it("sanitize sql array raises on placeholder bind mismatch", () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    expect(() => Post.sanitizeSqlArray("title = ? AND body = ?", "hello")).toThrow(
      /wrong number of bind variables \(1 for 2\)/,
    );
  });

  it("sanitizeSqlArray raises on extra binds with no placeholders", () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    expect(() => Post.sanitizeSqlArray("SELECT 1", "extra")).toThrow(
      /wrong number of bind variables \(1 for 0\)/,
    );
    expect(() => Post.sanitizeSqlArray("SELECT 1")).not.toThrow();
  });

  it("sanitizeSqlArray interpolates %d as an integer and rejects non-integer values", () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    expect(Post.sanitizeSqlArray("id = %d", 1)).toBe("id = 1");
    expect(Post.sanitizeSqlArray("id = %d", "12")).toBe("id = 12");
    expect(() => Post.sanitizeSqlArray("id = %d", "12abc")).toThrow(/invalid value for %d/);
    expect(() => Post.sanitizeSqlArray("id = %d", "3.5")).toThrow(/invalid value for %d/);
  });

  it("sanitizeSql dispatches through this.sanitizeSqlArray (subclass override)", () => {
    class Post extends Base {
      static _tableName = "posts";
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        return "OVERRIDDEN";
      }
    }
    expect(Post.sanitizeSql(["title = ?", "x"])).toBe("OVERRIDDEN");
  });

  it("sanitizeSqlForConditions dispatches through this.sanitizeSql", () => {
    class Post extends Base {
      static _tableName = "posts";
      static override sanitizeSql(
        _input: string | [string, ...unknown[]] | null | undefined,
      ): string | null {
        return "VIA_SANITIZE_SQL";
      }
    }
    expect(Post.sanitizeSqlForConditions(["a = ?", 1])).toBe("VIA_SANITIZE_SQL");
    expect(Post.sanitizeSqlForConditions(null)).toBeNull();
    expect(Post.sanitizeSqlForConditions("")).toBeNull();
  });

  it("sanitizeSqlForAssignment dispatches array-form through this.sanitizeSql", () => {
    class Post extends Base {
      static _tableName = "posts";
      static override sanitizeSql(
        _input: string | [string, ...unknown[]] | null | undefined,
      ): string | null {
        return "VIA_SANITIZE_SQL";
      }
    }
    expect(Post.sanitizeSqlForAssignment(["a = ?", 1])).toBe("VIA_SANITIZE_SQL");
  });

  it("sanitizeSqlForOrder dispatches through this.sanitizeSqlArray and this.disallowRawSqlBang", () => {
    let disallowCalled = false;
    class Post extends Base {
      static _tableName = "posts";
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        return "id, 1, 2";
      }
      static override disallowRawSqlBang(_args: unknown[]): void {
        disallowCalled = true;
      }
    }
    const result = Post.sanitizeSqlForOrder(["field(id, ?)", [1, 2]]);
    expect((result as { value?: string }).value).toBe("id, 1, 2");
    expect(disallowCalled).toBe(true);
  });

  it("sanitizeSqlForOrder substitutes binds when the first element is an Arel.sql literal", () => {
    let sanitizeCalled = false;
    class Post extends Base {
      static _tableName = "posts";
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        sanitizeCalled = true;
        return "field(id, 1,3,2)";
      }
      static override disallowRawSqlBang(_args: unknown[]): void {}
    }
    const result = Post.sanitizeSqlForOrder([arelSql("field(id, ?)"), [1, 3, 2]]);
    expect(sanitizeCalled).toBe(true);
    expect((result as { value?: string }).value).toBe("field(id, 1,3,2)");
  });

  it("sanitizeSqlForOrder returns the full array unchanged when the first element has no bind", () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    const condition: [string, ...unknown[]] = ["name ASC", "id DESC"];
    expect(Post.sanitizeSqlForOrder(condition)).toEqual(condition);
  });

  it("Base exposes the full Rails Sanitization::ClassMethods surface", () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    expect(Post.sanitizeSqlLike("50%_off")).toBe("50\\%\\_off");
    expect(Post.sanitizeSqlForOrder("id asc")).toBe("id asc");
    expect(Post.sanitizeSqlForAssignment({ title: "hi" }, "posts")).toContain("= 'hi'");
    expect(() => Post.disallowRawSqlBang(["DROP TABLE users"])).toThrow(/Dangerous query method/);
  });

  describe("private helpers (replace_bind_variables, quote_bound_value, etc)", () => {
    it("sanitize sql array handles %s format string", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const qs = (v: unknown) => Post.connection.quoteString(String(v));
      const result = Post.sanitizeSqlArray("name='%s' and group_id='%s'", "foo'bar", 4);
      expect(result).toBe(`name='${qs("foo'bar")}' and group_id='${qs(4)}'`);
    });

    it("sanitize sql array %s format raises on arity mismatch", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      expect(() => Post.sanitizeSqlArray("name='%s' and id='%s'", "foo")).toThrow(
        /wrong number of bind variables/,
      );
    });

    it("sanitize sql array %s format coerces nullish to empty string", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      expect(Post.sanitizeSqlArray("name='%s'", null)).toBe("name=''");
    });

    it("handles named bind variables with simple strings", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("title = :title AND author = :author", {
        title: "Hello",
        author: "World",
      });
      expect(result).toBe("title = 'Hello' AND author = 'World'");
    });

    it("handles named bind variables with numbers", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const a = Post.connection as unknown as {
        castBoundValue(v: unknown): unknown;
        quote(v: unknown): string;
      };
      const result = Post.sanitizeSqlArray("id = :id AND status = :status", {
        id: 42,
        status: "active",
      });
      expect(result).toBe(
        `id = ${a.quote(a.castBoundValue(42))} AND status = ${a.quote(a.castBoundValue("active"))}`,
      );
    });

    it.skip("handles mixed types in named bind variables", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray(
        "deleted_at IS :deleted AND age > :age AND active = :active",
        {
          deleted: null,
          age: 18,
          active: true,
        },
      );
      expect(result).toContain("IS NULL");
      expect(result).toContain("age > 18");
      expect(result).toContain("active = TRUE");
    });

    it("escapes single quotes in named bind variables", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("title = :title", { title: "It's a title" });
      expect(result).toBe(`title = ${Post.connection.quote("It's a title")}`);
    });

    it("handles PostgreSQL type casts in named bind variable patterns", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("created_at::date = :date", { date: "2024-01-01" });
      expect(result).toContain("::");
      expect(result).toContain("'2024-01-01'");
    });

    it("handles escaped colons in named bind variable patterns", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("TO_TIMESTAMP(:date, 'YYYY/MM/DD HH12\\:MI\\:SS')", {
        date: "2024-01-01",
      });
      expect(result).toContain("'2024-01-01'");
      expect(result).toContain("HH12:MI:SS");
    });

    it("raises on missing named bind variable", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      expect(() =>
        Post.sanitizeSqlArray("title = :title AND author = :author", { title: "Hello" }),
      ).toThrow(/missing value for :author/);
    });

    it("raises on mismatched positional bind variable count", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      expect(() => Post.sanitizeSqlArray("title = ? AND author = ?", "hello")).toThrow(
        /wrong number of bind variables \(1 for 2\)/,
      );
    });

    it("handles empty arrays as bind values", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("id IN (?)", []);
      expect(result).toContain("NULL");
    });

    it("handles arrays as bind values", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("id IN (?)", [1, 2, 3]);
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
    });

    it("handles Sets as bind values", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("id IN (?)", new Set([1, 2, 3]));
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
    });

    it("handles empty Sets as bind values", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const result = Post.sanitizeSqlArray("id IN (?)", new Set());
      expect(result).toContain("NULL");
    });

    it("boolean quoting routes through the active adapter", () => {
      class Post extends Base {
        static _tableName = "posts";
      }
      const sql = Post.sanitizeSqlArray("active = ?", true);
      const a = Post.connection as unknown as {
        castBoundValue(v: unknown): unknown;
        quote(v: unknown): string;
      };
      expect(sql).toBe(`active = ${a.quote(a.castBoundValue(true))}`);
    });
  });
});
