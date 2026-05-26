/**
 * Covers the real-table-name reuse in JoinDependency#_addThroughAssociation.
 *
 * Mirrors AliasTracker behavior (`activerecord/lib/active_record/table_metadata.rb`
 * / `alias_tracker.rb`): a joined table uses its real name when not already
 * in use, falling back to a tN alias only on collision. Previously
 * `_addThroughAssociation` hard-coded `tN` aliases for both the through
 * and target tables regardless of collisions, diverging from the
 * single-step `addAssociation` path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes, Table } from "@blazetrails/arel";

describe("JoinDependency#_addThroughAssociation real-table-name reuse", () => {
  class JdtAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class JdtPost extends Base {
    static {
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class JdtComment extends Base {
    static {
      this.attribute("post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    const adapter = createTestAdapter();
    for (const m of [JdtAuthor, JdtPost, JdtComment]) {
      m.adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(JdtAuthor, "jdtPosts", {
      className: "JdtPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(JdtPost, "jdtComments", {
      className: "JdtComment",
      foreignKey: "post_id",
    });
    Associations.hasMany.call(JdtAuthor, "jdtComments", {
      through: "jdtPosts",
      source: "jdtComments",
      className: "JdtComment",
    });
  });

  it("uses real table names for through+target when no collision", () => {
    const jd = new JoinDependency(JdtAuthor);
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);
    expect(node!.effectiveSqlName).toBe("jdt_comments");

    // Target table uses real name (no alias)
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toBeNull();

    // Through node also uses real name
    const throughNode = jd.nodes.find((n) => n.tableName === "jdt_posts");
    expect(throughNode).toBeDefined();
    expect(throughNode!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toBeNull();
  });

  it("falls back to tN alias when the target real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    Associations.hasMany.call(JdtAuthor, "directComments", {
      className: "JdtComment",
      foreignKey: "post_id",
    });
    jd.addAssociation("directComments");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();
    expect(node!.effectiveSqlName).toMatch(/^t\d+$/);

    // Target aliased
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toMatch(/^t\d+$/);

    // Through still uses real name
    const throughNode = jd.nodes.find(
      (n) => n.tableName === "jdt_posts" && n.assocName.includes("_through_"),
    );
    expect(throughNode).toBeDefined();
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toBeNull();
  });

  it("builds tree with through node as child of root and target as sibling", () => {
    const jd = new JoinDependency(JdtAuthor);
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();

    const root = jd.joinRoot;
    expect(root.baseKlass).toBe(JdtAuthor);
    // Through + target are both children of root (flat under root for has_many :through)
    expect(root.children.length).toBe(2);
    const throughChild = root.children[0];
    expect(throughChild._joinNode!.immediateAssocName).toBe("_through_jdtPosts");
    expect(throughChild._joinNode!.tableName).toBe("jdt_posts");
    const targetChild = root.children[1];
    expect(targetChild._joinNode!.immediateAssocName).toBe("jdtComments");
    expect(targetChild._joinNode!.tableName).toBe("jdt_comments");
  });

  it("falls back to tN alias when the through real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    jd.addAssociation("jdtPosts");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();

    // Through table aliased because jdt_posts already used
    const throughNode = jd.nodes.find(
      (n) => n.tableName === "jdt_posts" && n.assocName.includes("_through_"),
    );
    expect(throughNode).toBeDefined();
    expect(throughNode!.effectiveSqlName).toMatch(/^t\d+$/);
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toMatch(/^t\d+$/);

    // Target uses real name (first use)
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toBeNull();
  });
});
