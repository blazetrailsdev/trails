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
import { Associations } from "../associations.js";
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
      registerModel(m);
    }

    Associations.hasMany.call(Post, "comments", { className: "Comment" });
    Associations.belongsTo.call(Comment, "author", { className: "Author" });
    Associations.hasMany.call(Comment, "likes", { className: "Like" });
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
    registerModel(Tag);
    Associations.hasMany.call(Post, "tags", { className: "Tag" });

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
});
