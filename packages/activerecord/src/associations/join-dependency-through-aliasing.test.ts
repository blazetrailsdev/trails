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
    // Through table joined by real name (jdt_posts), not t1
    expect(node!.joinSql).toContain(`LEFT OUTER JOIN "jdt_posts"`);
    expect(node!.joinSql).not.toContain(`"jdt_posts" "t`);
    // Target table joined by real name (jdt_comments)
    expect(node!.joinSql).toContain(`LEFT OUTER JOIN "jdt_comments"`);
    expect(node!.joinSql).not.toContain(`"jdt_comments" "t`);
    expect(node!.effectiveSqlName).toBe("jdt_comments");
  });

  it("falls back to tN alias when the target real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    // Pre-occupy "jdt_comments" via a sibling direct hasMany on the author.
    Associations.hasMany.call(JdtAuthor, "directComments", {
      className: "JdtComment",
      foreignKey: "post_id",
    });
    jd.addAssociation("directComments");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();
    // Through table still uses real name; target now aliased to tN.
    expect(node!.joinSql).toContain(`LEFT OUTER JOIN "jdt_posts"`);
    expect(node!.joinSql).toMatch(/LEFT OUTER JOIN "jdt_comments" "t\d+"/);
    expect(node!.effectiveSqlName).toMatch(/^t\d+$/);
  });

  it("falls back to tN alias when the real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    // First, occupy "jdt_posts" via the direct join so the through table collides.
    jd.addAssociation("jdtPosts");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();
    // Through table now aliased to tN because jdt_posts already used.
    expect(node!.joinSql).toMatch(/LEFT OUTER JOIN "jdt_posts" "t\d+"/);
    // Target still uses real name (first use).
    expect(node!.joinSql).toContain(`LEFT OUTER JOIN "jdt_comments"`);
    expect(node!.joinSql).not.toContain(`"jdt_comments" "t`);
  });
});
