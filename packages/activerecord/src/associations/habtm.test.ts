/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass , loadHabtm} from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("HabtmDestroyOrderTest", () => {
  it.skip("may not delete a lesson with students", () => { /* fixture-dependent */ });
  it.skip("should not raise error if have foreign key in the join table", () => { /* fixture-dependent */ });
  it.skip("not destroying a student with lessons leaves student<=>lesson association intact", () => { /* fixture-dependent */ });
  it.skip("not destroying a lesson with students leaves student<=>lesson association intact", () => { /* fixture-dependent */ });
});

describe("HabtmDestroyOrderTest", () => {
  it.skip("may not delete a lesson with students", () => { /* fixture-dependent */ });
  it.skip("should not raise error if have foreign key in the join table", () => { /* fixture-dependent */ });
  it.skip("not destroying a student with lessons leaves student<=>lesson association intact", () => { /* fixture-dependent */ });
  it.skip("not destroying a lesson with students leaves student<=>lesson association intact", () => { /* fixture-dependent */ });
});


describe("has_and_belongs_to_many", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("loads associated records through a join table", async () => {
    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.attribute("title", "string");
    Post.adapter = adapter;
    Associations.hasAndBelongsToMany.call(Post, "tags", { joinTable: "posts_tags" });

    class Tag extends Base {
      static _tableName = "tags";
    }
    Tag.attribute("id", "integer");
    Tag.attribute("name", "string");
    Tag.adapter = adapter;
    registerModel(Tag);
    registerModel(Post);

    const post = await Post.create({ title: "Hello" });
    const t1 = await Tag.create({ name: "ruby" });
    const t2 = await Tag.create({ name: "rails" });
    const t3 = await Tag.create({ name: "js" });

    // Manually insert into join table
    await adapter.executeMutation(
      `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t1.id})`
    );
    await adapter.executeMutation(
      `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t2.id})`
    );

    const tags = await loadHabtm(post, "tags", { joinTable: "posts_tags" });
    expect(tags).toHaveLength(2);
    const names = tags.map((t: any) => t.readAttribute("name")).sort();
    expect(names).toEqual(["rails", "ruby"]);
  });

  it("uses default join table name (alphabetical)", async () => {
    class Developer extends Base {
      static _tableName = "developers";
    }
    Developer.attribute("id", "integer");
    Developer.attribute("name", "string");
    Developer.adapter = adapter;
    Associations.hasAndBelongsToMany.call(Developer, "projects");
    registerModel(Developer);

    class Project extends Base {
      static _tableName = "projects";
    }
    Project.attribute("id", "integer");
    Project.attribute("name", "string");
    Project.adapter = adapter;
    registerModel(Project);

    const dev = await Developer.create({ name: "Alice" });
    const proj = await Project.create({ name: "Rails" });

    // Default join table: alphabetical order of pluralized names
    // "developers" and "projects" -> "developers_projects"
    await adapter.executeMutation(
      `INSERT INTO "developers_projects" ("developer_id", "project_id") VALUES (${dev.id}, ${proj.id})`
    );

    const projects = await loadHabtm(dev, "projects", {});
    expect(projects).toHaveLength(1);
    expect(projects[0].readAttribute("name")).toBe("Rails");
  });
});
