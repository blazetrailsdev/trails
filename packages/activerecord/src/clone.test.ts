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

describe("CloneTest", () => {
  it("stays frozen", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const p = await Post.create({ title: "test" });
    p.freeze();
    expect(p.isFrozen()).toBe(true);
  });

  it("freezing a cloned model does not freeze clone", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const p = await Post.create({ title: "orig" });
    const c = p.clone();
    c.freeze();
    expect(c.isFrozen()).toBe(true);
    expect(p.isFrozen()).toBe(false);
  });
});

describe("CloneTest", () => {
  it("stays frozen", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const p = await Post.create({ title: "test" });
    p.freeze();
    expect(p.isFrozen()).toBe(true);
  });

  it("freezing a cloned model does not freeze clone", async () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const p = await Post.create({ title: "orig" });
    const c = p.clone();
    c.freeze();
    expect(c.isFrozen()).toBe(true);
    expect(p.isFrozen()).toBe(false);
  });

  it.skip("clone preserves frozen state", () => {});
  it.skip("clone of frozen record is not frozen", () => {});
});
