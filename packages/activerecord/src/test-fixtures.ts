/**
 * Shared test model definitions mirroring Rails' test/models/ directory.
 *
 * These models are used across many test files. Instead of redefining them
 * in each test, import from here.
 *
 * Usage:
 *   import { createFixtures } from "./test-fixtures.js";
 *   const f = createFixtures();
 *   const post = await f.Post.create({ title: "Hello", body: "World" });
 */
import { Base, registerModel, acceptsNestedAttributesFor } from "./index.js";
import { Associations } from "./associations.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

/**
 * Creates a fresh set of test model classes with their own adapter.
 * Each call returns new model classes with a fresh adapter so tests
 * don't share database state. Note: models are registered in the global
 * model registry (registerModel), so later calls overwrite earlier ones.
 * Since associations resolve className via the registry at runtime, the
 * most recently created fixture set's classes will be used for lookups.
 * This works correctly when tests run sequentially (each beforeEach
 * creates a fresh set), but concurrent tests sharing a worker should
 * each call createFixtures() to ensure they get the latest classes.
 */
export interface TestFixtures {
  adapter: DatabaseAdapter;
  Author: typeof Base;
  AuthorAddress: typeof Base;
  Post: typeof Base;
  Comment: typeof Base;
  Tag: typeof Base;
  Tagging: typeof Base;
  Category: typeof Base;
  Pirate: typeof Base;
  Ship: typeof Base;
  ShipPart: typeof Base;
  Treasure: typeof Base;
  Bird: typeof Base;
  Parrot: typeof Base;
  Developer: typeof Base;
  Project: typeof Base;
  Company: typeof Base;
  Topic: typeof Base;
  Book: typeof Base;
  Person: typeof Base;
  [key: string]: typeof Base | DatabaseAdapter;
}

export function createFixtures(existingAdapter?: DatabaseAdapter): TestFixtures {
  const adapter = existingAdapter || createTestAdapter();

  // ── Author ──────────────────────────────────────────────────────────
  class Author extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.attribute("author_address_id", "integer");
      this.attribute("organization_id", "string");
      this.adapter = adapter;
    }
  }

  // ── AuthorAddress ───────────────────────────────────────────────────
  class AuthorAddress extends Base {
    static {
      this._tableName = "author_addresses";
      this.adapter = adapter;
    }
  }

  // ── Post ────────────────────────────────────────────────────────────
  class Post extends Base {
    static {
      this._tableName = "posts";
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("type", "string");
      this.attribute("author_id", "integer");
      this.attribute("legacy_comments_count", "integer", { default: 0 });
      this.attribute("tags_count", "integer", { default: 0 });
      this.adapter = adapter;
    }
  }

  // ── Comment ─────────────────────────────────────────────────────────
  class Comment extends Base {
    static {
      this._tableName = "comments";
      this.attribute("body", "string");
      this.attribute("post_id", "integer");
      this.attribute("type", "string");
      this.attribute("parent_id", "integer");
      this.attribute("children_count", "integer", { default: 0 });
      this.adapter = adapter;
    }
  }

  // ── Tag ─────────────────────────────────────────────────────────────
  class Tag extends Base {
    static {
      this._tableName = "tags";
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }

  // ── Tagging ─────────────────────────────────────────────────────────
  class Tagging extends Base {
    static {
      this._tableName = "taggings";
      this.attribute("tag_id", "integer");
      this.attribute("post_id", "integer");
      this.attribute("taggable_id", "integer");
      this.attribute("taggable_type", "string");
      this.adapter = adapter;
    }
  }

  // ── Category ────────────────────────────────────────────────────────
  class Category extends Base {
    static {
      this._tableName = "categories";
      this.attribute("name", "string");
      this.attribute("type", "string");
      this.adapter = adapter;
    }
  }

  // ── Pirate ──────────────────────────────────────────────────────────
  class Pirate extends Base {
    static {
      this._tableName = "pirates";
      this.attribute("catchphrase", "string");
      this.attribute("parrot_id", "integer");
      this.adapter = adapter;
    }
  }

  // ── Ship ────────────────────────────────────────────────────────────
  class Ship extends Base {
    static {
      this._tableName = "ships";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.attribute("treasures_count", "integer", { default: 0 });
      this.adapter = adapter;
      this.validates("name", { presence: true });
    }
  }

  // ── ShipPart ────────────────────────────────────────────────────────
  class ShipPart extends Base {
    static {
      this._tableName = "ship_parts";
      this.attribute("name", "string");
      this.attribute("ship_id", "integer");
      this.adapter = adapter;
    }
  }

  // ── Treasure ────────────────────────────────────────────────────────
  class Treasure extends Base {
    static {
      this._tableName = "treasures";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.adapter = adapter;
    }
  }

  // ── Bird ────────────────────────────────────────────────────────────
  class Bird extends Base {
    static {
      this._tableName = "birds";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.adapter = adapter;
      this.validates("name", { presence: true });
    }
  }

  // ── Parrot ──────────────────────────────────────────────────────────
  class Parrot extends Base {
    static {
      this._tableName = "parrots";
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }

  // ── Developer ───────────────────────────────────────────────────────
  class Developer extends Base {
    static {
      this._tableName = "developers";
      this.attribute("name", "string");
      this.attribute("salary", "integer", { default: 70000 });
      this.adapter = adapter;
    }
  }

  // ── Project ─────────────────────────────────────────────────────────
  class Project extends Base {
    static {
      this._tableName = "projects";
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }

  // ── Company ─────────────────────────────────────────────────────────
  class Company extends Base {
    static {
      this._tableName = "companies";
      this.attribute("name", "string");
      this.attribute("type", "string");
      this.attribute("firm_id", "integer");
      this.attribute("client_of", "integer");
      this.adapter = adapter;
    }
  }

  // ── Topic ───────────────────────────────────────────────────────────
  class Topic extends Base {
    static {
      this._tableName = "topics";
      this.attribute("title", "string");
      this.attribute("content", "string");
      this.attribute("type", "string");
      this.attribute("author_name", "string");
      this.attribute("parent_id", "integer");
      this.attribute("replies_count", "integer", { default: 0 });
      this.adapter = adapter;
    }
  }

  // ── Book ────────────────────────────────────────────────────────────
  class Book extends Base {
    static {
      this._tableName = "books";
      this.attribute("name", "string");
      this.attribute("author_id", "integer");
      this.attribute("format", "string");
      this.adapter = adapter;
    }
  }

  // ── Person ──────────────────────────────────────────────────────────
  class Person extends Base {
    static {
      this._tableName = "people";
      this.attribute("first_name", "string");
      this.attribute("lock_version", "integer", { default: 0 });
      this.adapter = adapter;
    }
  }

  // ── Register models ─────────────────────────────────────────────────
  const models = {
    Author,
    AuthorAddress,
    Post,
    Comment,
    Tag,
    Tagging,
    Category,
    Pirate,
    Ship,
    ShipPart,
    Treasure,
    Bird,
    Parrot,
    Developer,
    Project,
    Company,
    Topic,
    Book,
    Person,
  };

  for (const [name, model] of Object.entries(models)) {
    registerModel(name, model);
  }

  // ── Set up associations ─────────────────────────────────────────────

  // Post associations
  Associations.belongsTo.call(Post, "author", {
    className: "Author",
    foreignKey: "author_id",
  });
  Associations.hasMany.call(Post, "comments", {
    className: "Comment",
    foreignKey: "post_id",
  });
  Associations.hasMany.call(Post, "taggings", {
    className: "Tagging",
    foreignKey: "post_id",
  });

  // Comment associations
  Associations.belongsTo.call(Comment, "post", {
    className: "Post",
    foreignKey: "post_id",
  });

  // Author associations
  Associations.hasMany.call(Author, "posts", {
    className: "Post",
    foreignKey: "author_id",
  });
  Associations.hasMany.call(Author, "books", {
    className: "Book",
    foreignKey: "author_id",
  });

  // Tagging associations
  Associations.belongsTo.call(Tagging, "tag", {
    className: "Tag",
    foreignKey: "tag_id",
  });
  Associations.belongsTo.call(Tagging, "post", {
    className: "Post",
    foreignKey: "post_id",
  });

  // Tag associations
  Associations.hasMany.call(Tag, "taggings", {
    className: "Tagging",
    foreignKey: "tag_id",
  });

  // Pirate associations
  Associations.belongsTo.call(Pirate, "parrot", {
    className: "Parrot",
    foreignKey: "parrot_id",
  });
  Associations.hasMany.call(Pirate, "birds", {
    className: "Bird",
    foreignKey: "pirate_id",
  });
  Associations.hasOne.call(Pirate, "ship", {
    className: "Ship",
    foreignKey: "pirate_id",
  });
  Associations.hasMany.call(Pirate, "treasures", {
    className: "Treasure",
    foreignKey: "pirate_id",
  });

  // Ship associations
  Associations.belongsTo.call(Ship, "pirate", {
    className: "Pirate",
    foreignKey: "pirate_id",
  });
  Associations.hasMany.call(Ship, "parts", {
    className: "ShipPart",
    foreignKey: "ship_id",
  });

  // ShipPart associations
  Associations.belongsTo.call(ShipPart, "ship", {
    className: "Ship",
    foreignKey: "ship_id",
  });

  // Bird associations
  Associations.belongsTo.call(Bird, "pirate", {
    className: "Pirate",
    foreignKey: "pirate_id",
  });

  // Treasure associations
  Associations.belongsTo.call(Treasure, "pirate", {
    className: "Pirate",
    foreignKey: "pirate_id",
  });

  // Book associations
  Associations.belongsTo.call(Book, "author", {
    className: "Author",
    foreignKey: "author_id",
  });

  // Topic associations (self-referential)
  Associations.belongsTo.call(Topic, "parent", {
    className: "Topic",
    foreignKey: "parent_id",
  });

  // Company associations (self-referential firm)
  Associations.belongsTo.call(Company, "firm", {
    className: "Company",
    foreignKey: "firm_id",
  });

  // Developer <-> Project (HABTM)
  Associations.hasAndBelongsToMany.call(Developer, "projects", {
    className: "Project",
    joinTable: "developers_projects",
  });
  Associations.hasAndBelongsToMany.call(Project, "developers", {
    className: "Developer",
    joinTable: "developers_projects",
  });

  // Pirate <-> Parrot (HABTM)
  Associations.hasAndBelongsToMany.call(Pirate, "parrots", {
    className: "Parrot",
    joinTable: "parrots_pirates",
  });
  Associations.hasAndBelongsToMany.call(Parrot, "pirates", {
    className: "Pirate",
    joinTable: "parrots_pirates",
  });

  // Nested attributes
  acceptsNestedAttributesFor(Pirate, "birds", { allowDestroy: true });
  acceptsNestedAttributesFor(Pirate, "ship", { allowDestroy: true });
  acceptsNestedAttributesFor(Ship, "parts", { allowDestroy: true });
  acceptsNestedAttributesFor(Ship, "pirate", { allowDestroy: true });

  return { adapter, ...models };
}
