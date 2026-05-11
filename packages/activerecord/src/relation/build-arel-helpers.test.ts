/**
 * Rails-mirrored private helpers on Relation: assert_modifiable!,
 * check_if_method_has_arguments!, table_name_matches?, arel_column,
 * arel_columns, arel_columns_from_hash, arel_column_with_table.
 *
 * Test names mirror Rails' relation_test.rb / query_methods_test.rb
 * conventions where applicable.
 */
import { describe, it, expect } from "vitest";
import { Nodes, Table as ArelTable } from "@blazetrails/arel";
import { Base, Relation, UnmodifiableRelation } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

class Post extends Base {
  static _tableName = "posts";
}
Post.attribute("id", "integer");
Post.attribute("title", "string");
Post.attribute("body", "text");
Post.adapter = createTestAdapter();

function relation(): Relation<Post> {
  return Post.all() as unknown as Relation<Post>;
}

describe("Relation private build-arel helpers", () => {
  describe("assertModifiableBang", () => {
    it("does not raise on an unloaded relation", () => {
      expect(() => relation().assertModifiableBang()).not.toThrow();
    });

    it("raises UnmodifiableRelation once the relation is loaded", () => {
      const rel = relation();
      (rel as any)._loaded = true;
      expect(() => rel.assertModifiableBang()).toThrow(UnmodifiableRelation);
    });
  });

  describe("checkIfMethodHasArgumentsBang", () => {
    it("raises ArgumentError-named error when args is empty", () => {
      try {
        relation().checkIfMethodHasArgumentsBang("select", []);
        expect.fail("expected throw");
      } catch (err) {
        expect((err as Error).name).toBe("ArgumentError");
        expect((err as Error).message).toMatch(/\.select\(\) must contain arguments/);
      }
    });

    it("does not raise when args has at least one entry", () => {
      expect(() => relation().checkIfMethodHasArgumentsBang("select", ["id"])).not.toThrow();
    });

    it("uses a symbol's description in the error message (Rails passes a Symbol via __callee__)", () => {
      try {
        relation().checkIfMethodHasArgumentsBang(Symbol("select"), []);
        expect.fail("expected throw");
      } catch (err) {
        expect((err as Error).message).toMatch(/\.select\(\) must contain arguments/);
      }
    });

    it("flattens arrays and compacts blanks (nil, false, '', [], {}) per Rails compact_blank!", () => {
      const args: unknown[] = [["a", null, "", false], "b", undefined, {}, [], "  "];
      relation().checkIfMethodHasArgumentsBang("select", args);
      expect(args).toEqual(["a", "b"]);
    });

    it("recursively expands plain objects via flattenedArgs (trails extension over Rails)", () => {
      // The canonical flattenedArgs expands plain objects into key/value
      // entries so where({a: 1}) call sites can re-process the pieces.
      const args: unknown[] = [{ a: "x" }];
      relation().checkIfMethodHasArgumentsBang("select", args);
      expect(args).toEqual(["a", "x"]);
    });
  });

  describe("isTableNameMatches", () => {
    it("matches the bare table name", () => {
      expect(relation().isTableNameMatches("posts")).toBe(true);
    });

    it("matches the adapter-quoted table name", () => {
      const quoted = (Post.adapter as any).quoteTableName("posts");
      expect(relation().isTableNameMatches(quoted)).toBe(true);
    });

    it("does not match when used as a qualifier", () => {
      expect(relation().isTableNameMatches("posts.id")).toBe(false);
    });

    it("does not match when the only occurrence is immediately after FROM", () => {
      // Mirrors Rails' (?<!FROM)\s lookbehind. If the from-target *is*
      // our model table (e.g. via a subquery rendering SELECT * FROM
      // \"posts\"), we don't want arelColumn to double-qualify bare
      // refs — return false.
      expect(relation().isTableNameMatches('SELECT * FROM "posts"')).toBe(false);
    });

    it("matches when the table also appears outside the FROM clause", () => {
      // The hit Rails actually wants: a subquery that joins/filters on
      // our table, so bare attribute refs must qualify back to it.
      // Note `posts` must appear bare (no trailing dot) — the (?!\\.)
      // negative lookahead deliberately excludes qualified usages.
      expect(relation().isTableNameMatches('SELECT * FROM "subquery" JOIN posts ON ...')).toBe(
        true,
      );
    });
  });

  describe("arelColumn", () => {
    it("returns a model-table attribute for a known column", () => {
      const node = relation().arelColumn("title");
      expect(node).toBeInstanceOf(Object);
      expect((node as any).relation?.name).toBe("posts");
      expect((node as any).name).toBe("title");
    });

    it("passes through an Arel node unchanged", () => {
      const lit = new Nodes.SqlLiteral("COUNT(*)");
      expect(relation().arelColumn(lit)).toBe(lit);
    });

    it("resolves table.column form via arelColumnWithTable", () => {
      const node = relation().arelColumn("authors.name");
      expect((node as any).relation?.name).toBe("authors");
      expect((node as any).name).toBe("name");
    });

    it("falls back to SqlLiteral for arbitrary SQL fragments", () => {
      const node = relation().arelColumn("LOWER(title)");
      expect(node).toBeInstanceOf(Nodes.SqlLiteral);
    });
  });

  describe("arelColumnWithTable", () => {
    it("registers the table in references_values", () => {
      const rel = relation();
      rel.arelColumnWithTable("comments", "id");
      expect((rel as any)._referencesValues).toContain("comments");
    });
  });

  describe("arelColumnsFromHash", () => {
    it("expands string-valued entries", () => {
      const nodes = relation().arelColumnsFromHash({ comments: "id" });
      expect(nodes).toHaveLength(1);
      expect((nodes[0] as any).relation?.name).toBe("comments");
    });

    it("expands array-valued entries", () => {
      const nodes = relation().arelColumnsFromHash({ comments: ["id", "body"] });
      expect(nodes).toHaveLength(2);
    });

    it("throws TypeError on unsupported value shape", () => {
      expect(() => relation().arelColumnsFromHash({ comments: 42 as unknown as string })).toThrow(
        TypeError,
      );
    });
  });

  describe("arelColumns", () => {
    it("maps strings via arelColumn", () => {
      const nodes = relation().arelColumns(["title"]);
      expect(nodes).toHaveLength(1);
      expect((nodes[0] as any).name).toBe("title");
    });

    it("passes Arel nodes, flattens hash entries, and includes thunk results", () => {
      const lit = new Nodes.SqlLiteral("1");
      const nodes = relation().arelColumns([lit, { comments: ["id", "body"] }, () => lit]);
      expect(nodes).toHaveLength(4);
      expect(nodes[0]).toBe(lit);
      expect(nodes[3]).toBe(lit);
    });

    it("does not route non-plain-object args (e.g. Table) through arelColumnsFromHash", () => {
      const table = new ArelTable("posts");
      const nodes = relation().arelColumns([table]);
      expect(nodes).toEqual([table]);
    });
  });
});

describe("Relation#offset float truncation", () => {
  it("truncates float offset to integer via Math.trunc", () => {
    const r = relation().offset(1.7);
    expect((r as any)._offsetValue).toBe(1);
  });

  it("emits OFFSET 1 in SQL when offset(1.7) is called", () => {
    const sql = relation().offset(1.7).toSql();
    expect(sql).toContain("OFFSET 1");
  });
});
