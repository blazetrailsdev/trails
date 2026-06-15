/**
 * Tests for lazy referenced-table aliasing in JoinDependency.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency#make_constraints reading
 * `@references[reflection.name]` (join_dependency.rb:202). `references` recorded
 * by `join_constraints` (join_dependency.rb:88–92) re-aliases an emitted join to
 * its reference name (`authors AS author`).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { AliasTracker } from "./alias-tracker.js";

describe("JoinDependency referenced-table aliasing", () => {
  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class Post extends Base {
    static {
      this.attribute("authorId", "integer");
    }
  }
  class Award extends Base {
    static {
      this.attribute("authorId", "integer");
    }
  }

  beforeEach(() => {
    const adapter = createTestAdapter();
    for (const m of [Author, Post, Award]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.belongsTo.call(Post, "author", { className: "Author", foreignKey: "authorId" });
    Associations.hasMany.call(Author, "awards", { className: "Award", foreignKey: "authorId" });
  });

  const joinTableName = (join: Nodes.Join): string => {
    const left = (join as any).left;
    return left.tableAlias ?? left.name;
  };

  // Collect every table name referenced by an Attribute anywhere in a node.
  // (Node#fetchAttribute returns only the first attribute — Rails' bind-param
  // semantics — so walk the AST manually to see both sides of an equality.)
  const tablesInPredicate = (node: unknown): Set<string> => {
    const tables = new Set<string>();
    const visit = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      if (n instanceof Nodes.Attribute) {
        const rel = n.relation as any;
        tables.add(rel.tableAlias ?? rel.name);
        return;
      }
      for (const key of ["left", "right", "expr"]) {
        if (key in (n as any)) visit((n as any)[key]);
      }
      const children = (n as any).children;
      if (Array.isArray(children)) for (const c of children) visit(c);
    };
    visit(node);
    return tables;
  };

  it("aliases a referenced association to its reference name", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");
    const joins = jd.joinConstraints([], undefined, ["author"]);
    expect(joins).toHaveLength(1);
    expect(joinTableName(joins[0])).toBe("author");

    // The ON predicate is rebound to the alias — no stray reference to the real
    // `authors` table survives, so the emitted SQL is self-consistent.
    const on = (joins[0] as any).right as Nodes.On;
    const tables = tablesInPredicate(on.expr as Nodes.Node);
    expect(tables.has("author")).toBe(true);
    expect(tables.has("authors")).toBe(false);

    // The SELECT projection follows the re-aliased table.
    const selectTables = new Set(
      jd.buildSelectArel().map((as) => {
        const rel = ((as as any).left as Nodes.Attribute).relation as any;
        return rel.tableAlias ?? rel.name;
      }),
    );
    expect(selectTables.has("author")).toBe(true);
    expect(selectTables.has("authors")).toBe(false);
  });

  it("leaves the join on its real table when not referenced", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");
    const joins = jd.joinConstraints([]);
    expect(joins).toHaveLength(1);
    expect(joinTableName(joins[0])).toBe("authors");
  });

  it("rebinds a nested child's ON predicate when its parent is re-aliased", () => {
    // includes(author: :awards).references(:author): re-aliasing the `author`
    // join to `author` must rebind the grandchild `awards` join's ON
    // (`authors.id = awards.author_id`) to the alias (`author.id = ...`), not
    // leave it pointing at the real `authors` table.
    const jd = new JoinDependency(Post);
    jd.addAssociationSpec({ author: "awards" });
    const joins = jd.joinConstraints([], undefined, ["author"]);
    expect(joins).toHaveLength(2);

    const awardsJoin = joins.find((j) => joinTableName(j) === "awards")!;
    const tables = tablesInPredicate(((awardsJoin as any).right as Nodes.On).expr as Nodes.Node);
    expect(tables.has("author")).toBe(true);
    expect(tables.has("authors")).toBe(false);
  });

  it("falls back to the reflection alias_candidate when the reference name is taken", () => {
    // Mirrors Rails aliased_table_for's collision branch: when the referenced
    // name is already occupied, the reflection's alias_candidate
    // (`{plural}_{parent}`) is used — NOT a numeric suffix of the reference name.
    const jd = new JoinDependency(Post);
    jd.addAssociation("author");
    const tracker = new AliasTracker(
      undefined,
      new Map([
        ["posts", 1],
        ["authors", 1],
        ["author", 1],
      ]),
    );
    const joins = jd.joinConstraints([], tracker, ["author"]);
    expect(joins).toHaveLength(1);
    expect(joinTableName(joins[0])).toBe("authors_posts");
  });
});
