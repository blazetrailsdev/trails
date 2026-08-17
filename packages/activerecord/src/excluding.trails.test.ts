/**
 * Trails-only: Rails materializes `relations.flat_map(&:ids)` eagerly inside
 * the synchronous `excluding!`, so it has a single arm and no deferred marker
 * to pin. trails defers unloaded relation args, and that arm must read the
 * primary-key attribute off the predicate builder's own table — Rails'
 * `predicate_builder[primary_key, records]` (predicate_builder.rb:53-55) — not
 * off the model's default arel table.
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "./test-fixtures.js";
import { registerModel } from "./associations.js";
import { Relation } from "./relation.js";
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

  // `spawn.excluding!(...)` (query_methods.rb:1580) has no empty-argument
  // short circuit: the result is always a distinct relation carrying the
  // (vacuously true) inverted predicate.
  it("spawns and appends the inverted predicate with no arguments", () => {
    const all = Post.all();
    const excluded = all.excluding();

    expect(excluded).not.toBe(all);
    expect(excluded.whereClause.predicates.length).toBe(all.whereClause.predicates.length + 1);
    expect(excluded.toSql()).not.toBe(all.toSql());
  });
});
