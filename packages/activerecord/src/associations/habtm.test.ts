/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, loadHabtm } from "../index.js";
import { Associations } from "../associations.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

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

    // Create the join table
    await adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "posts_tags" ("post_id" INTEGER, "tag_id" INTEGER)`,
    );

    const post = await Post.create({ title: "Hello" });
    const t1 = await Tag.create({ name: "ruby" });
    const t2 = await Tag.create({ name: "rails" });
    const t3 = await Tag.create({ name: "js" });

    // Manually insert into join table
    await adapter.executeMutation(
      `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t1.id})`,
    );
    await adapter.executeMutation(
      `INSERT INTO "posts_tags" ("post_id", "tag_id") VALUES (${post.id}, ${t2.id})`,
    );

    const tags = await loadHabtm(post, "tags", { joinTable: "posts_tags" });
    expect(tags).toHaveLength(2);
    const names = tags.map((t: any) => t.name).sort();
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

    // Create the join table
    await adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "developers_projects" ("developer_id" INTEGER, "project_id" INTEGER)`,
    );

    const dev = await Developer.create({ name: "Alice" });
    const proj = await Project.create({ name: "Rails" });

    // Default join table: alphabetical order of pluralized names
    // "developers" and "projects" -> "developers_projects"
    await adapter.executeMutation(
      `INSERT INTO "developers_projects" ("developer_id", "project_id") VALUES (${dev.id}, ${proj.id})`,
    );

    const projects = await loadHabtm(dev, "projects", {});
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Rails");
  });
});
