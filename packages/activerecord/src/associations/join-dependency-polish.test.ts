/**
 * Tests for JoinBase.table (Arel Table node) and joinType propagation
 * in makeConstraints.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { Nodes, Table } from "@blazetrails/arel";

describe("JoinBase.table", () => {
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

  it("returns the Arel Table passed at construction", () => {
    const arelTable = Post.arelTable;
    const joinBase = new JoinBase(Post, arelTable);
    expect(joinBase.table).toBe(arelTable);
    expect(joinBase.table).toBeInstanceOf(Table);
    expect(joinBase.table.name).toBe(Post.tableName);
  });

  it("is accessible via joinRoot on JoinDependency", () => {
    const jd = new JoinDependency(Post);
    expect(jd.joinRoot.table).toBeInstanceOf(Table);
    expect(jd.joinRoot.table.name).toBe(Post.tableName);
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
