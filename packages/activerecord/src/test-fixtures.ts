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
import type { AssociationProxy } from "./associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { Base, registerModel, acceptsNestedAttributesFor } from "./index.js";

/**
 * Creates a fresh set of test model classes. Models resolve their adapter
 * via `Base.connection` (the handler chain) rather than holding a bound
 * adapter — callers must bootstrap a handler connection (e.g.
 * `setupHandlerSuite()`) before instantiating. Note: models are registered
 * in the global model registry (registerModel), so later calls overwrite
 * earlier ones. Since associations resolve className via the registry at
 * runtime, the most recently created fixture set's classes will be used for
 * lookups. This works correctly when tests run sequentially (each beforeEach
 * creates a fresh set), but concurrent tests sharing a worker should
 * each call createFixtures() to ensure they get the latest classes.
 */
export interface TestFixtures {
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
  DevelopersProject: typeof Base;
  Company: typeof Base;
  Account: typeof Base;
  Topic: typeof Base;
  Book: typeof Base;
  Person: typeof Base;
  [key: string]: typeof Base;
}

export function createFixtures(): TestFixtures {
  // ── Author ──────────────────────────────────────────────────────────
  class Author extends Base {
    declare name: string;
    declare author_address_id: number;
    declare author_address_extra_id: number;
    declare owned_essay_id: number;
    declare organization_id: string;
    declare posts: AssociationProxy<Post>;
    declare books: AssociationProxy<Book>;

    static {
      this._tableName = "authors";
      this.attribute("name", "string");
      this.attribute("author_address_id", "integer");
      this.attribute("author_address_extra_id", "integer");
      this.attribute("owned_essay_id", "integer");
      this.attribute("organization_id", "string");
      this.hasMany("posts", {
        className: "Post",
        foreignKey: "author_id",
      });
      this.hasMany("books", {
        className: "Book",
        foreignKey: "author_id",
      });
    }
  }

  // ── AuthorAddress ───────────────────────────────────────────────────
  class AuthorAddress extends Base {
    static {
      this._tableName = "author_addresses";
    }
  }

  // ── Post ────────────────────────────────────────────────────────────
  class Post extends Base {
    declare title: string;
    declare body: string;
    declare "type": string;
    declare author_id: number;
    declare legacy_comments_count: number;
    declare tags_count: number;
    declare author: Author | null;
    declare comments: AssociationProxy<Comment>;
    declare taggings: AssociationProxy<Tagging>;
    declare loadBelongsTo: (name: "author") => Promise<Author | null>;

    static {
      this._tableName = "posts";
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("type", "string");
      this.attribute("author_id", "integer");
      this.attribute("legacy_comments_count", "integer", { default: 0 });
      this.attribute("tags_count", "integer", { default: 0 });
      this.belongsTo("author", {
        className: "Author",
        foreignKey: "author_id",
      });
      this.hasMany("comments", {
        className: "Comment",
        foreignKey: "post_id",
      });
      this.hasMany("taggings", {
        className: "Tagging",
        foreignKey: "post_id",
      });
    }
  }

  // ── Comment ─────────────────────────────────────────────────────────
  class Comment extends Base {
    declare body: string;
    declare post_id: number;
    declare "type": string;
    declare parent_id: number;
    declare company_id: number;
    declare children_count: number;
    declare post: Post | null;
    declare loadBelongsTo: (name: "post") => Promise<Post | null>;

    static {
      this._tableName = "comments";
      this.attribute("body", "string");
      this.attribute("post_id", "integer");
      this.attribute("type", "string");
      this.attribute("parent_id", "integer");
      this.attribute("company_id", "integer");
      this.attribute("children_count", "integer", { default: 0 });
      this.belongsTo("post", {
        className: "Post",
        foreignKey: "post_id",
      });
    }
  }

  // ── Tag ─────────────────────────────────────────────────────────────
  class Tag extends Base {
    declare name: string;
    declare taggings: AssociationProxy<Tagging>;

    static {
      this._tableName = "tags";
      this.attribute("name", "string");
      this.hasMany("taggings", {
        className: "Tagging",
        foreignKey: "tag_id",
      });
    }
  }

  // ── Tagging ─────────────────────────────────────────────────────────
  class Tagging extends Base {
    declare tag_id: number;
    declare post_id: number;
    declare taggable_id: number;
    declare taggable_type: string;
    declare tag: Tag | null;
    declare post: Post | null;
    declare loadBelongsTo: ((name: "tag") => Promise<Tag | null>) &
      ((name: "post") => Promise<Post | null>);

    static {
      this._tableName = "taggings";
      this.attribute("tag_id", "integer");
      this.attribute("post_id", "integer");
      this.attribute("taggable_id", "integer");
      this.attribute("taggable_type", "string");
      this.belongsTo("tag", {
        className: "Tag",
        foreignKey: "tag_id",
      });
      this.belongsTo("post", {
        className: "Post",
        foreignKey: "post_id",
      });
    }
  }

  // ── Category ────────────────────────────────────────────────────────
  class Category extends Base {
    declare name: string;
    declare "type": string;

    static {
      this._tableName = "categories";
      this.attribute("name", "string");
      this.attribute("type", "string");
    }
  }

  // ── Pirate ──────────────────────────────────────────────────────────
  class Pirate extends Base {
    declare catchphrase: string;
    declare parrot_id: number;
    declare parrot: Parrot | null;
    declare birds: AssociationProxy<Bird>;
    declare ship: Ship | null;
    declare treasures: AssociationProxy<Treasure>;
    declare parrots: AssociationProxy<Parrot>;
    declare loadBelongsTo: (name: "parrot") => Promise<Parrot | null>;
    declare loadHasOne: (name: "ship") => Promise<Ship | null>;

    static {
      this._tableName = "pirates";
      this.attribute("catchphrase", "string");
      this.attribute("parrot_id", "integer");
      this.belongsTo("parrot", {
        className: "Parrot",
        foreignKey: "parrot_id",
      });
      this.hasMany("birds", {
        className: "Bird",
        foreignKey: "pirate_id",
      });
      this.hasOne("ship", {
        className: "Ship",
        foreignKey: "pirate_id",
      });
      this.hasMany("treasures", {
        className: "Treasure",
        foreignKey: "pirate_id",
      });
      this.hasAndBelongsToMany("parrots", {
        className: "Parrot",
        joinTable: "parrots_pirates",
      });
    }
  }

  // ── Ship ────────────────────────────────────────────────────────────
  class Ship extends Base {
    declare name: string;
    declare pirate_id: number;
    declare treasures_count: number;
    declare pirate: Pirate | null;
    declare parts: AssociationProxy<ShipPart>;
    declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;

    static {
      this._tableName = "ships";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.attribute("treasures_count", "integer", { default: 0 });
      this.validates("name", { presence: true });
      this.belongsTo("pirate", {
        className: "Pirate",
        foreignKey: "pirate_id",
      });
      this.hasMany("parts", {
        className: "ShipPart",
        foreignKey: "ship_id",
      });
    }
  }

  // ── ShipPart ────────────────────────────────────────────────────────
  class ShipPart extends Base {
    declare name: string;
    declare ship_id: number;
    declare ship: Ship | null;
    declare loadBelongsTo: (name: "ship") => Promise<Ship | null>;

    static {
      this._tableName = "ship_parts";
      this.attribute("name", "string");
      this.attribute("ship_id", "integer");
      this.belongsTo("ship", {
        className: "Ship",
        foreignKey: "ship_id",
      });
    }
  }

  // ── Treasure ────────────────────────────────────────────────────────
  class Treasure extends Base {
    declare name: string;
    declare pirate_id: number;
    declare pirate: Pirate | null;
    declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;

    static {
      this._tableName = "treasures";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.belongsTo("pirate", {
        className: "Pirate",
        foreignKey: "pirate_id",
      });
    }
  }

  // ── Bird ────────────────────────────────────────────────────────────
  class Bird extends Base {
    declare name: string;
    declare pirate_id: number;
    declare pirate: Pirate | null;
    declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;

    static {
      this._tableName = "birds";
      this.attribute("name", "string");
      this.attribute("pirate_id", "integer");
      this.validates("name", { presence: true });
      this.belongsTo("pirate", {
        className: "Pirate",
        foreignKey: "pirate_id",
      });
    }
  }

  // ── Parrot ──────────────────────────────────────────────────────────
  class Parrot extends Base {
    declare name: string;
    declare pirates: AssociationProxy<Pirate>;

    static {
      this._tableName = "parrots";
      this.attribute("name", "string");
      this.hasAndBelongsToMany("pirates", {
        className: "Pirate",
        joinTable: "parrots_pirates",
      });
    }
  }

  // ── Developer ───────────────────────────────────────────────────────
  class Developer extends Base {
    declare name: string;
    declare salary: number;
    declare shared_computers: string;
    declare projects: AssociationProxy<Project>;

    static {
      this._tableName = "developers";
      this.attribute("name", "string");
      this.attribute("salary", "integer", { default: 70000 });
      this.attribute("shared_computers", "string");
      this.hasAndBelongsToMany("projects", {
        className: "Project",
        joinTable: "developers_projects",
      });
    }
  }

  // ── Project ─────────────────────────────────────────────────────────
  class Project extends Base {
    declare name: string;
    declare developers: AssociationProxy<Developer>;

    static {
      this._tableName = "projects";
      this.attribute("name", "string");
      this.hasAndBelongsToMany("developers", {
        className: "Developer",
        joinTable: "developers_projects",
      });
    }
  }

  // ── DevelopersProject (HABTM join model) ────────────────────────────
  // Rails schema (test/schema/schema.rb:546): `create_table :developers_projects,
  // id: false` — no synthetic PK; developer_id + project_id form the composite
  // key. Declaring the CPK here matches Rails and lets the test-adapter keep
  // the HABTM-driven CPK shape (see test-adapter.ts extractColumnsFromModels).
  class DevelopersProject extends Base {
    declare developer_id: number;
    declare project_id: number;
    declare joined_on: Temporal.PlainDate;
    declare access_level: number;

    static {
      this._tableName = "developers_projects";
      this._primaryKey = ["developer_id", "project_id"];
      this.attribute("developer_id", "integer");
      this.attribute("project_id", "integer");
      this.attribute("joined_on", "date");
      this.attribute("access_level", "integer", { default: 1 });
    }
  }

  // ── Company ─────────────────────────────────────────────────────────
  class Company extends Base {
    declare name: string;
    declare "type": string;
    declare firm_id: number;
    declare client_of: number;
    declare firm_name: string;
    declare rating: number;
    declare description: string;
    declare account_id: number;
    declare status: number;
    declare firm: Company | null;
    declare loadBelongsTo: (name: "firm") => Promise<Company | null>;

    static {
      this._tableName = "companies";
      this.attribute("name", "string");
      this.attribute("type", "string");
      this.attribute("firm_id", "integer");
      this.attribute("client_of", "integer");
      this.attribute("firm_name", "string");
      this.attribute("rating", "integer");
      this.attribute("description", "string");
      this.attribute("account_id", "integer");
      this.attribute("status", "integer");
      this.belongsTo("firm", {
        className: "Company",
        foreignKey: "firm_id",
      });
    }
  }

  // ── Topic ───────────────────────────────────────────────────────────
  class Topic extends Base {
    declare title: string;
    declare content: string;
    declare "type": string;
    declare author_name: string;
    declare parent_id: number;
    declare replies_count: number;
    declare parent: Topic | null;
    declare loadBelongsTo: (name: "parent") => Promise<Topic | null>;

    static {
      this._tableName = "topics";
      this.attribute("title", "string");
      this.attribute("content", "string");
      this.attribute("type", "string");
      this.attribute("author_name", "string");
      this.attribute("parent_id", "integer");
      this.attribute("replies_count", "integer", { default: 0 });
      this.belongsTo("parent", {
        className: "Topic",
        foreignKey: "parent_id",
      });
    }
  }

  // ── Book ────────────────────────────────────────────────────────────
  class Book extends Base {
    declare name: string;
    declare author_id: number;
    declare format: string;
    declare status: number;
    declare last_read: number;
    declare language: number;
    declare author_visibility: number;
    declare illustrator_visibility: number;
    declare font_size: number;
    declare difficulty: number;
    declare boolean_status: number;
    declare cover: string;
    declare author: Author | null;
    declare loadBelongsTo: (name: "author") => Promise<Author | null>;

    static {
      this._tableName = "books";
      this.attribute("name", "string");
      this.attribute("author_id", "integer");
      this.attribute("format", "string");
      this.attribute("status", "integer");
      this.attribute("last_read", "integer");
      this.attribute("language", "integer");
      this.attribute("author_visibility", "integer");
      this.attribute("illustrator_visibility", "integer");
      this.attribute("font_size", "integer");
      this.attribute("difficulty", "integer");
      this.attribute("boolean_status", "integer");
      this.attribute("cover", "string");
      this.belongsTo("author", {
        className: "Author",
        foreignKey: "author_id",
      });
    }
  }

  // ── Person ──────────────────────────────────────────────────────────
  class Person extends Base {
    declare first_name: string;
    declare lock_version: number;

    static {
      this._tableName = "people";
      this.attribute("first_name", "string");
      this.attribute("lock_version", "integer", { default: 0 });
    }
  }

  // ── Account ─────────────────────────────────────────────────────────
  class Account extends Base {
    declare firm_id: number;
    declare credit_limit: number;
    declare firm_name: string;
    declare status: string;
    declare transactions_count: number;
    declare updated_at: Temporal.Instant | Temporal.PlainDateTime;
    declare firm: Company | null;
    declare loadBelongsTo: (name: "firm") => Promise<Company | null>;

    static {
      this._tableName = "accounts";
      this.attribute("firm_id", "integer");
      this.attribute("credit_limit", "integer");
      this.attribute("firm_name", "string");
      this.attribute("status", "string");
      this.attribute("transactions_count", "integer");
      this.attribute("updated_at", "datetime");
      this.belongsTo("firm", {
        className: "Company",
        foreignKey: "firm_id",
      });
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
    DevelopersProject,
    Company,
    Topic,
    Book,
    Person,
    Account,
  };

  for (const [name, model] of Object.entries(models)) {
    registerModel(name, model);
  }

  // ── Set up associations ─────────────────────────────────────────────

  // Post associations

  // Comment associations

  // Author associations

  // Tagging associations

  // Tag associations

  // Pirate associations

  // Ship associations

  // ShipPart associations

  // Bird associations

  // Treasure associations

  // Book associations

  // Topic associations (self-referential)

  // Company associations (self-referential firm)

  // Account associations

  // Developer <-> Project (HABTM)

  // Pirate <-> Parrot (HABTM)

  // Nested attributes
  acceptsNestedAttributesFor(Pirate, "birds", { allowDestroy: true });
  acceptsNestedAttributesFor(Pirate, "ship", { allowDestroy: true });
  acceptsNestedAttributesFor(Ship, "parts", { allowDestroy: true });
  acceptsNestedAttributesFor(Ship, "pirate", { allowDestroy: true });

  return { ...models };
}
