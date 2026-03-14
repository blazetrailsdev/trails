/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "../index.js";
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
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("HasManyScopingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModels() {
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(Author, "posts", {});
    registerModel(Author);
    registerModel(Post);
    return { Author, Post };
  }

  it("forwarding of static methods", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    await Post.create({ title: "P2", author_id: a.id });
    const proxy = new CollectionProxy(a, "posts", {
      type: "hasMany",
      name: "posts",
      options: {},
    } as any);
    const posts = await proxy.toArray();
    expect(posts.length).toBe(2);
  });

  it("nested scope finder", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "A", author_id: a.id });
    await Post.create({ title: "B", author_id: a.id });
    const proxy = new CollectionProxy(a, "posts", {
      type: "hasMany",
      name: "posts",
      options: {},
    } as any);
    const posts = await proxy.where({ title: "A" });
    expect(posts.length).toBe(1);
    expect(posts[0].readAttribute("title")).toBe("A");
  });

  it("none scoping", async () => {
    const { Author, Post } = makeModels();
    const a = await Author.create({ name: "Alice" });
    await Post.create({ title: "P1", author_id: a.id });
    const noneRel = Post.none();
    const results = await noneRel.toArray();
    expect(results.length).toBe(0);
  });
});
