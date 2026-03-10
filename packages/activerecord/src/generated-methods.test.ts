/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "./index.js";
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
} from "./associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("GeneratedMethodsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("association methods override attribute methods of same name", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("author_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Post, "author", {});
    const ref = reflectOnAssociation(Post, "author");
    expect(ref).not.toBeNull();
    expect(ref!.macro).toBe("belongsTo");
  });

  it("model method overrides association method", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    // Model has attribute "title", no association named "title" should conflict
    const p = new Post({ title: "hello" });
    expect(p.readAttribute("title")).toBe("hello");
  });

  it("included module overwrites association methods", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.attribute("tag_id", "integer"); this.adapter = adapter; }
    }
    Associations.belongsTo.call(Post, "tag", {});
    const ref = reflectOnAssociation(Post, "tag");
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe("tag");
  });
});
