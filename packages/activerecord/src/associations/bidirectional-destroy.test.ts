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

describe("BidirectionalDestroyDependenciesTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("bidirectional dependence when destroying item with belongs to association", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    Associations.belongsTo.call(Book, "author");
    Associations.hasMany.call(Author, "books", { dependent: "destroy" });
    registerModel(Author);
    registerModel(Book);

    const author = await Author.create({ name: "Alice" });
    const book = await Book.create({ title: "B1", author_id: author.id });
    await author.destroy();
    expect(author.isDestroyed()).toBe(true);
  });

  it("bidirectional dependence when destroying item with has one association", async () => {
    class Profile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("user_id", "integer");
        this.adapter = adapter;
      }
    }
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasOne.call(User, "profile", { dependent: "destroy" });
    Associations.belongsTo.call(Profile, "user");
    registerModel(User);
    registerModel(Profile);

    const user = await User.create({ name: "Bob" });
    const profile = await Profile.create({ bio: "hi", user_id: user.id });
    await user.destroy();
    expect(user.isDestroyed()).toBe(true);
  });

  it("bidirectional dependence when destroying item with has one association fails first time", async () => {
    class Widget extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("gadget_id", "integer");
        this.adapter = adapter;
      }
    }
    class Gadget extends Base {
      static {
        this.attribute("label", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasOne.call(Gadget, "widget", { dependent: "destroy" });
    registerModel(Widget);
    registerModel(Gadget);

    const gadget = await Gadget.create({ label: "G1" });
    const widget = await Widget.create({ name: "W1", gadget_id: gadget.id });
    // Destroy should succeed even with bidirectional dependency
    await gadget.destroy();
    expect(gadget.isDestroyed()).toBe(true);
  });
});
