import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { clearReflectionsCache } from "../reflection.js";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes, Table } from "@blazetrails/arel";

describe("JoinDependency walk() deduplication", () => {
  fixtures({});

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
    for (const m of [Post, Comment, Author, Like]) {
      (m as any)._reflections = {};
      clearReflectionsCache(m);
      registerModel(m);
    }

    Post.hasMany("comments", { className: "Comment" });
    Comment.belongsTo("author", { className: "Author" });
    Comment.hasMany("likes", { className: "Like" });
    Post.hasMany("commentLikes", { through: "comments", source: "likes", className: "Like" });
  });

  it("deduplicates a matched has_many :through subtree across joinsToAdd", () => {
    const jd1 = new JoinDependency(Post, null, "commentLikes", Nodes.OuterJoin);
    const jd2 = new JoinDependency(Post, null, "commentLikes", Nodes.OuterJoin);

    const joins = jd1.joinConstraints([jd2]);
    const tables = joins.map((j) => {
      const t = (j as Nodes.OuterJoin).left;
      return (t as any).tableAlias ?? (t as any).name;
    });
    expect(joins).toHaveLength(2);
    expect(tables.filter((t) => t === "comments")).toHaveLength(1);
    expect(tables.filter((t) => t === "likes")).toHaveLength(1);
  });

  it("deduplicates shared subtree when merging two JoinDependencies", () => {
    const jd1 = new JoinDependency(Post, null, "comments.author", Nodes.OuterJoin);

    const jd2 = new JoinDependency(Post, null, "comments.likes", Nodes.OuterJoin);

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
    const jd1 = new JoinDependency(Post, null, "comments", Nodes.OuterJoin);

    class Tag extends Base {
      static {
        this.attribute("post_id", "integer");
      }
    }
    (Tag as any)._reflections = {};
    clearReflectionsCache(Tag);
    registerModel(Tag);
    Post.hasMany("tags", { className: "Tag" });

    const jd2 = new JoinDependency(Post, null, "tags", Nodes.OuterJoin);

    const joins = jd1.joinConstraints([jd2]);

    expect(joins).toHaveLength(2);
  });

  it("does not duplicate shared intermediate join on second merge", () => {
    const jd1 = new JoinDependency(Post, null, "comments.author", Nodes.OuterJoin);

    const jd2 = new JoinDependency(Post, null, "comments.likes", Nodes.OuterJoin);

    const jd3 = new JoinDependency(Post, null, "comments", Nodes.OuterJoin);

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
    clearReflectionsCache(Post);
    Post.hasMany("reviews", { className: "Comment" });

    const jd1 = new JoinDependency(Post, null, ["comments", "reviews"], Nodes.OuterJoin);

    const jd2 = new JoinDependency(Post, null, "reviews.likes", Nodes.OuterJoin);

    const joins = jd1.joinConstraints([jd2]);

    const likesJoin = joins.find((j) => {
      const table = (j as Nodes.OuterJoin).left;
      return (table as any).name === "likes" || (table as any).tableAlias === "likes";
    }) as Nodes.OuterJoin | undefined;
    expect(likesJoin).toBeDefined();

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

    const jd1ReviewsJoin = joins.find((j) => {
      const table = (j as Nodes.OuterJoin).left as Table | Nodes.TableAlias;
      const realName = table instanceof Nodes.TableAlias ? table.tableName : table.name;
      const alias = String(table.tableAlias ?? table.name);
      return realName === "comments" && alias !== "comments";
    }) as Nodes.OuterJoin | undefined;
    expect(jd1ReviewsJoin).toBeDefined();

    const jd1ReviewsTable = jd1ReviewsJoin!.left as Table | Nodes.TableAlias;
    const jd1ReviewsAlias = String(jd1ReviewsTable.tableAlias ?? jd1ReviewsTable.name);
    expect(referencedTables).toContain(jd1ReviewsAlias);
    expect(referencedTables).toContain("likes");
    expect(referencedTables).not.toContain("comments");
  });
});
