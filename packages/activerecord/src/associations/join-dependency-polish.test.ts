/**
 * Tests for JoinBase.arelTable, joinType propagation in makeConstraints,
 * and readonlyValue propagation in instantiateFromRows.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { Nodes, Table } from "@blazetrails/arel";

describe("JoinBase.arelTable", () => {
  let adapter: any;

  class Post extends Base {
    static {
      this.attribute("title", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    (Post as any).adapter = adapter;
    (Post as any)._associations = [];
    registerModel(Post);
  });

  it("returns an Arel Table node", () => {
    const joinBase = new JoinBase(Post);
    const arelTable = joinBase.arelTable;
    expect(arelTable).toBeInstanceOf(Table);
    expect(arelTable.name).toBe(Post.tableName);
  });
});

describe("joinType propagation in joinConstraints", () => {
  let adapter: any;

  class Post extends Base {
    static {
      this.attribute("title", "string");
    }
  }

  class Comment extends Base {
    static {
      this.attribute("postId", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Post, Comment]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment" });
  });

  it("emits InnerJoin when joinType is InnerJoin", () => {
    const jd = new JoinDependency(Post, Nodes.InnerJoin);
    jd.addAssociation("comments");

    const joins = jd.joinConstraints([]);
    expect(joins.length).toBeGreaterThan(0);
    for (const join of joins) {
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    }
  });

  it("emits OuterJoin when joinType is OuterJoin", () => {
    const jd = new JoinDependency(Post, Nodes.OuterJoin);
    jd.addAssociation("comments");

    const joins = jd.joinConstraints([]);
    expect(joins.length).toBeGreaterThan(0);
    for (const join of joins) {
      expect(join).toBeInstanceOf(Nodes.OuterJoin);
    }
  });
});

describe("readonlyValue propagation in instantiateFromRows", () => {
  let adapter: any;

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("authorId", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Author, Post]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Author, "posts", { className: "Post" });
  });

  it("sets _readonly on parent records when readonlyValue is true", () => {
    const jd = new JoinDependency(Author);
    jd.addAssociation("posts");

    const baseColumns = Author.columnNames();
    const row: Record<string, unknown> = {};
    row["t0_r0"] = 1;
    for (let i = 1; i < baseColumns.length; i++) {
      row[`t0_r${i}`] = null;
    }
    const postColumns = Post.columnNames();
    for (let i = 0; i < postColumns.length; i++) {
      row[`t1_r${i}`] = i === 0 ? 10 : null;
    }

    const { parents } = jd.instantiateFromRows([row], false, true);
    expect(parents.length).toBe(1);
    expect(parents[0]._readonly).toBe(true);
  });

  it("does not set _readonly when readonlyValue is falsy", () => {
    const jd = new JoinDependency(Author);
    jd.addAssociation("posts");

    const baseColumns = Author.columnNames();
    const row: Record<string, unknown> = {};
    row["t0_r0"] = 1;
    for (let i = 1; i < baseColumns.length; i++) {
      row[`t0_r${i}`] = null;
    }
    const postColumns = Post.columnNames();
    for (let i = 0; i < postColumns.length; i++) {
      row[`t1_r${i}`] = i === 0 ? 10 : null;
    }

    const { parents } = jd.instantiateFromRows([row], false);
    expect(parents.length).toBe(1);
    expect(parents[0]._readonly).toBeFalsy();
  });
});
