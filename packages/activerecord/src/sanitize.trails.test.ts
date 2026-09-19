import { describe, it, expect } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { User } from "./test-helpers/models/user.js";

fixtures({});

describe("sanitizeSql", () => {
  it.skip("sanitizeSqlArray replaces ? placeholders with quoted values", () => {
    expect(User.sanitizeSqlArray("name = ?", "Alice")).toBe("name = 'Alice'");
    expect(User.sanitizeSqlArray("age > ?", 18)).toBe("age > 18");
    expect(User.sanitizeSqlArray("name = ? AND age > ?", "Bob", 25)).toBe(
      "name = 'Bob' AND age > 25",
    );
    expect(User.sanitizeSqlArray("active = ?", true)).toBe("active = TRUE");
    expect(User.sanitizeSqlArray("deleted_at = ?", null)).toBe("deleted_at = NULL");
  });

  it("sanitizeSqlArray escapes single quotes", () => {
    const a = User.connection;
    expect(User.sanitizeSqlArray("name = ?", "O'Brien")).toBe(`name = ${a.quote("O'Brien")}`);
  });

  it("sanitizeSql handles string passthrough", () => {
    expect(User.sanitizeSql("name = 'Alice'")).toBe("name = 'Alice'");
  });

  it("sanitizeSql returns null for blank input (Rails alias of sanitize_sql_for_conditions)", () => {
    expect(User.sanitizeSql("")).toBeNull();
    expect(User.sanitizeSql("   ")).toBeNull();
    expect(User.sanitizeSql([] as unknown as [string, ...unknown[]])).toBeNull();
  });

  it("sanitizeSql handles array format", () => {
    const a = User.connection as unknown as {
      castBoundValue(v: unknown): unknown;
      quote(v: unknown): string;
    };
    expect(User.sanitizeSql(["name = ? AND age > ?", "Alice", 30])).toBe(
      `name = ${a.quote(a.castBoundValue("Alice"))} AND age > ${a.quote(a.castBoundValue(30))}`,
    );
  });

  it("sanitize sql array raises on placeholder bind mismatch", () => {
    expect(() => Post.sanitizeSqlArray("title = ? AND body = ?", "hello")).toThrow(
      /wrong number of bind variables \(1 for 2\)/,
    );
  });

  it("sanitizeSqlArray raises on extra binds with no placeholders", () => {
    expect(() => Post.sanitizeSqlArray("SELECT 1", "extra")).toThrow(
      /wrong number of bind variables \(1 for 0\)/,
    );
    expect(() => Post.sanitizeSqlArray("SELECT 1")).not.toThrow();
  });

  it("sanitizeSqlArray interpolates %d as an integer and rejects non-integer values", () => {
    expect(Post.sanitizeSqlArray("id = %d", 1)).toBe("id = 1");
    expect(Post.sanitizeSqlArray("id = %d", "12")).toBe("id = 12");
    expect(() => Post.sanitizeSqlArray("id = %d", "12abc")).toThrow(/invalid value for %d/);
    expect(() => Post.sanitizeSqlArray("id = %d", "3.5")).toThrow(/invalid value for %d/);
  });

  it("sanitizeSql dispatches through this.sanitizeSqlArray (subclass override)", () => {
    class SubPost extends Post {
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        return "OVERRIDDEN";
      }
    }
    expect(SubPost.sanitizeSql(["title = ?", "x"])).toBe("OVERRIDDEN");
  });

  it("sanitizeSqlForConditions dispatches through this.sanitizeSql", () => {
    class SubPost extends Post {
      static override sanitizeSql(
        _input: string | [string, ...unknown[]] | null | undefined,
      ): string | null {
        return "VIA_SANITIZE_SQL";
      }
    }
    expect(SubPost.sanitizeSqlForConditions(["a = ?", 1])).toBe("VIA_SANITIZE_SQL");
    expect(SubPost.sanitizeSqlForConditions(null)).toBeNull();
    expect(SubPost.sanitizeSqlForConditions("")).toBeNull();
  });

  it("sanitizeSqlForAssignment dispatches array-form through this.sanitizeSql", () => {
    class SubPost extends Post {
      static override sanitizeSql(
        _input: string | [string, ...unknown[]] | null | undefined,
      ): string | null {
        return "VIA_SANITIZE_SQL";
      }
    }
    expect(SubPost.sanitizeSqlForAssignment(["a = ?", 1])).toBe("VIA_SANITIZE_SQL");
  });

  it("sanitizeSqlForOrder dispatches through this.sanitizeSqlArray and this.disallowRawSqlBang", () => {
    let disallowCalled = false;
    class SubPost extends Post {
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        return "id, 1, 2";
      }
      static override disallowRawSqlBang(_args: unknown[]): void {
        disallowCalled = true;
      }
    }
    const result = SubPost.sanitizeSqlForOrder(["field(id, ?)", [1, 2]]);
    expect((result as { value?: string }).value).toBe("id, 1, 2");
    expect(disallowCalled).toBe(true);
  });

  it("sanitizeSqlForOrder substitutes binds when the first element is an Arel.sql literal", () => {
    let sanitizeCalled = false;
    class SubPost extends Post {
      static override sanitizeSqlArray(_template: string, ..._binds: unknown[]): string {
        sanitizeCalled = true;
        return "field(id, 1,3,2)";
      }
      static override disallowRawSqlBang(_args: unknown[]): void {}
    }
    const result = SubPost.sanitizeSqlForOrder([arelSql("field(id, ?)"), [1, 3, 2]]);
    expect(sanitizeCalled).toBe(true);
    expect((result as { value?: string }).value).toBe("field(id, 1,3,2)");
  });

  it("sanitizeSqlForOrder returns the full array unchanged when the first element has no bind", () => {
    const condition: [string, ...unknown[]] = ["name ASC", "id DESC"];
    expect(Post.sanitizeSqlForOrder(condition)).toEqual(condition);
  });

  it("Base exposes the full Rails Sanitization::ClassMethods surface", () => {
    expect(Post.sanitizeSqlLike("50%_off")).toBe("50\\%\\_off");
    expect(Post.sanitizeSqlForOrder("id asc")).toBe("id asc");
    expect(Post.sanitizeSqlForAssignment({ title: "hi" }, "posts")).toContain("= 'hi'");
    expect(() => Post.disallowRawSqlBang(["DROP TABLE users"])).toThrow(/Dangerous query method/);
  });

  describe("private helpers (replace_bind_variables, quote_bound_value, etc)", () => {
    it("sanitize sql array handles %s format string", () => {
      const qs = (v: unknown) => Post.connection.quoteString(String(v));
      const result = Post.sanitizeSqlArray("name='%s' and group_id='%s'", "foo'bar", 4);
      expect(result).toBe(`name='${qs("foo'bar")}' and group_id='${qs(4)}'`);
    });

    it("sanitize sql array %s format raises on arity mismatch", () => {
      expect(() => Post.sanitizeSqlArray("name='%s' and id='%s'", "foo")).toThrow(
        /wrong number of bind variables/,
      );
    });

    it("sanitize sql array %s format coerces nullish to empty string", () => {
      expect(Post.sanitizeSqlArray("name='%s'", null)).toBe("name=''");
    });

    it("handles named bind variables with simple strings", () => {
      const result = Post.sanitizeSqlArray("title = :title AND author = :author", {
        title: "Hello",
        author: "World",
      });
      expect(result).toBe("title = 'Hello' AND author = 'World'");
    });

    it("handles named bind variables with numbers", () => {
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
      const result = Post.sanitizeSqlArray("title = :title", { title: "It's a title" });
      expect(result).toBe(`title = ${Post.connection.quote("It's a title")}`);
    });

    it("handles PostgreSQL type casts in named bind variable patterns", () => {
      const result = Post.sanitizeSqlArray("created_at::date = :date", { date: "2024-01-01" });
      expect(result).toContain("::");
      expect(result).toContain("'2024-01-01'");
    });

    it("handles escaped colons in named bind variable patterns", () => {
      const result = Post.sanitizeSqlArray("TO_TIMESTAMP(:date, 'YYYY/MM/DD HH12\\:MI\\:SS')", {
        date: "2024-01-01",
      });
      expect(result).toContain("'2024-01-01'");
      expect(result).toContain("HH12:MI:SS");
    });

    it("raises on missing named bind variable", () => {
      expect(() =>
        Post.sanitizeSqlArray("title = :title AND author = :author", { title: "Hello" }),
      ).toThrow(/missing value for :author/);
    });

    it("raises on mismatched positional bind variable count", () => {
      expect(() => Post.sanitizeSqlArray("title = ? AND author = ?", "hello")).toThrow(
        /wrong number of bind variables \(1 for 2\)/,
      );
    });

    it("handles empty arrays as bind values", () => {
      const result = Post.sanitizeSqlArray("id IN (?)", []);
      expect(result).toContain("NULL");
    });

    it("handles arrays as bind values", () => {
      const result = Post.sanitizeSqlArray("id IN (?)", [1, 2, 3]);
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
    });

    it("handles Sets as bind values", () => {
      const result = Post.sanitizeSqlArray("id IN (?)", new Set([1, 2, 3]));
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("3");
    });

    it("handles empty Sets as bind values", () => {
      const result = Post.sanitizeSqlArray("id IN (?)", new Set());
      expect(result).toContain("NULL");
    });

    it("boolean quoting routes through the active adapter", () => {
      const sql = Post.sanitizeSqlArray("active = ?", true);
      const a = Post.connection as unknown as {
        castBoundValue(v: unknown): unknown;
        quote(v: unknown): string;
      };
      expect(sql).toBe(`active = ${a.quote(a.castBoundValue(true))}`);
    });
  });
});
