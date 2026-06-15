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

  beforeEach(() => {
    const adapter = createTestAdapter();
    for (const m of [Author, Post]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.belongsTo.call(Post, "author", { className: "Author", foreignKey: "authorId" });
  });

  const joinTableName = (join: Nodes.Join): string => {
    const left = (join as any).left;
    return left.tableAlias ?? left.name;
  };

  // Collect every table name referenced by an Attribute anywhere in a node.
  const tablesInPredicate = (node: Nodes.Node): Set<string> => {
    const tables = new Set<string>();
    node.fetchAttribute((attr: Nodes.Node) => {
      if (attr instanceof Nodes.Attribute) {
        const rel = attr.relation as any;
        tables.add(rel.tableAlias ?? rel.name);
      }
      return true;
    });
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
