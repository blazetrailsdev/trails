/**
 * Covers walk() deduplication in JoinDependency — when two JoinDependency
 * instances share a subtree, merging via joinConstraints() should emit
 * exactly one join per unique (parent, association) pair.
 *
 * Mirrors: Rails JoinDependency walk() / make_constraints behavior.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { clearReflectionsCache } from "../reflection.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes } from "@blazetrails/arel";

describe("JoinDependency walk() deduplication", () => {
  let adapter: any;

  class Post extends Base {
    static {
      this.attribute("title", "string");
    }
  }

  class Comment extends Base {
    static {
      this.attribute("post_id", "integer");
      this.attribute("author_id", "integer");
      this.attribute("body", "string");
    }
  }

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Like extends Base {
    static {
      this.attribute("comment_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Post, Comment, Author, Like]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      (m as any)._reflections = {};
      clearReflectionsCache(m);
      registerModel(m);
    }

    Post.hasMany("comments", { className: "Comment" });
    Comment.belongsTo("author", { className: "Author" });
    Comment.hasMany("likes", { className: "Like" });
  });

  it("deduplicates shared subtree when merging two JoinDependencies", () => {
    const jd1 = new JoinDependency(Post);
    jd1.addNestedAssociation("comments.author");

    const jd2 = new JoinDependency(Post);
    jd2.addNestedAssociation("comments.likes");

    const joins = jd1.joinConstraints([jd2]);

    const joinTables = joins.map((j) => {
      const outerJoin = j as Nodes.OuterJoin;
      const table = outerJoin.left;
      return (table as any).tableAlias ?? (table as any).name;
    });

    const commentJoins = joinTables.filter((t) => t === "comments");
    expect(commentJoins).toHaveLength(1);

    expect(joins).toHaveLength(3);
  });

  it("emits all joins when JoinDependencies share no subtree", () => {
    const jd1 = new JoinDependency(Post);
    jd1.addAssociation("comments");

    class Tag extends Base {
      static {
        this.attribute("post_id", "integer");
      }
    }
    (Tag as any).adapter = adapter;
    (Tag as any)._associations = [];
    (Tag as any)._reflections = {};
    clearReflectionsCache(Tag);
    registerModel(Tag);
    Post.hasMany("tags", { className: "Tag" });

    const jd2 = new JoinDependency(Post);
    jd2.addAssociation("tags");

    const joins = jd1.joinConstraints([jd2]);

    expect(joins).toHaveLength(2);
  });

  it("does not duplicate shared intermediate join on second merge", () => {
    const jd1 = new JoinDependency(Post);
    jd1.addNestedAssociation("comments.author");

    const jd2 = new JoinDependency(Post);
    jd2.addNestedAssociation("comments.likes");

    const jd3 = new JoinDependency(Post);
    jd3.addNestedAssociation("comments");

    const joins = jd1.joinConstraints([jd2, jd3]);

    const joinTables = joins.map((j) => {
      const table = (j as Nodes.OuterJoin).left;
      return (table as any).tableAlias ?? (table as any).name;
    });

    const commentJoins = joinTables.filter((t) => t === "comments");
    expect(commentJoins).toHaveLength(1);
    expect(joins).toHaveLength(3);
  });

  it("rebinds ON predicates to merged parent alias when table names collide", () => {
    // Mirrors Rails: cascaded eager loading with self-table reference.
    // Post has both "comments" and "reviews" targeting the Comment model/table.
    // jd1 joins comments (gets "comments") then reviews (collision → aliased).
    // jd2 joins reviews (gets "comments" — no collision in its own namespace)
    //      then reviews.likes.
    // After walk merges jd2's "reviews" into jd1's aliased "reviews",
    // the likes ON predicate must reference jd1's alias, not jd2's "comments".
    clearReflectionsCache(Post);
    Post.hasMany("reviews", { className: "Comment" });

    const jd1 = new JoinDependency(Post);
    jd1.addAssociation("comments");
    jd1.addAssociation("reviews");

    const jd2 = new JoinDependency(Post);
    jd2.addNestedAssociation("reviews.likes");

    const joins = jd1.joinConstraints([jd2]);

    // jd1 emits: comments (table "comments"), reviews (table aliased e.g. "t2")
    // jd2's "likes" should reference jd1's reviews alias in its ON predicate.
    const likesJoin = joins.find((j) => {
      const table = (j as Nodes.OuterJoin).left;
      return (table as any).name === "likes" || (table as any).tableAlias === "likes";
    }) as Nodes.OuterJoin | undefined;
    expect(likesJoin).toBeDefined();

    // Extract all table references from the ON predicate
    const onNode = likesJoin!.right as Nodes.On;
    const referencedTables = new Set<string>();
    function collectTableRefs(node: unknown): void {
      if (node instanceof Nodes.Attribute) {
        const rel = (node as any).relation;
        if (rel) referencedTables.add(rel.tableAlias ?? rel.name);
        return;
      }
      if (node && typeof node === "object") {
        for (const key of ["left", "right", "expr", "children"]) {
          const val = (node as any)[key];
          if (Array.isArray(val)) val.forEach(collectTableRefs);
          else if (val) collectTableRefs(val);
        }
      }
    }
    collectTableRefs(onNode.expr);

    // The ON predicate must NOT reference "comments" for the parent side —
    // that's jd2's un-aliased name. It should reference jd1's alias (e.g. "t2").
    const jd1ReviewsJoin = joins.find((j) => {
      const table = (j as Nodes.OuterJoin).left;
      const alias = (table as any).tableAlias;
      const name = (table as any).name;
      return name === "comments" && alias && alias !== "comments";
    }) as Nodes.OuterJoin | undefined;
    expect(jd1ReviewsJoin).toBeDefined();

    const jd1ReviewsAlias = (jd1ReviewsJoin!.left as any).tableAlias;
    expect(referencedTables).toContain(jd1ReviewsAlias);
    expect(referencedTables).toContain("likes");
    expect(referencedTables).not.toContain("comments");
  });
});
