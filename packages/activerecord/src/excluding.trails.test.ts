import { describe, it, expect } from "vitest";
import "./index.js";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import { Relation } from "./relation.js";
import { DeferredIdsNotIn } from "./relation/predicate-builder/deferred-distinct-pk-in.js";
import { Post } from "./test-helpers/models/post.js";

registerModel(Post);

describe("excluding deferred arm (trails)", () => {
  fixtures(["posts"]);

  it("reads the primary key off the predicate builder's table for an unloaded relation", () => {
    const aliased = new Relation(Post, Post.arelTable.alias("p"));
    const relation = aliased.excluding(Post.where({ title: "Welcome to the weblog" }));

    const predicate = relation.whereClause.predicates.at(-1) as Nodes.NotIn;
    const attribute = predicate.left as Nodes.Attribute;
    expect(attribute.relation).toBeInstanceOf(Nodes.TableAlias);
    expect((attribute.relation as Nodes.TableAlias).name).toBe("p");
  });

  it("materializes a loaded relation argument to literal ids", async () => {
    const loaded = await Post.where({ title: "Welcome to the weblog" }).load();
    const sql = Post.excluding(loaded).toSql();

    const predicate = Post.excluding(loaded).whereClause.predicates.at(-1);
    expect(predicate).not.toBeInstanceOf(DeferredIdsNotIn);
    expect(sql).not.toMatch(/IN \(SELECT/i);
    expect(sql).toContain(String((await loaded.records())[0].id));
  });

  it("spawns and appends the inverted predicate with no arguments", () => {
    const all = Post.all();
    const excluded = all.excluding();

    expect(excluded).not.toBe(all);
    expect(excluded.whereClause.predicates.length).toBe(all.whereClause.predicates.length + 1);
    expect(excluded.toSql()).not.toBe(all.toSql());
  });
});

describe("excluding a loaded relation of a model without a primary key (trails)", () => {
  fixtures(["edges", "vertices"]);

  it("contributes an empty id per record, matching Array(nil)", async () => {
    const { Edge } = await import("./test-helpers/models/edge.js");
    const loaded = await Edge.all().load();

    expect(() => Edge.excluding(loaded).toSql()).toThrow("can't quote Array");
  });
});

describe("excluding a model with a composite primary key (trails)", () => {
  fixtures(["cpkBooks", "cpkAuthors", "cpkOrders"]);

  it("builds the predicate over the composite key rather than raising", async () => {
    const { CpkBook } = await import("./test-helpers/models/cpk.js");
    registerModel(CpkBook);
    const book = (await CpkBook.all())[0];

    const relation = CpkBook.excluding(book);
    const predicate = relation.whereClause.predicates.at(-1) as Nodes.NotIn;
    expect((predicate.left as Nodes.Attribute).name).toEqual(["author_id", "id"]);
  });
});
