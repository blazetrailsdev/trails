/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
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

// ==========================================================================
// WithTest — targets relation/with_test.rb
// ==========================================================================
describe("WithTest", () => {
  it("with generates CTE", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const rel = Post.all().with("recent_posts", "SELECT * FROM posts WHERE created_at > '2024-01-01'");
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
  });
});

describe("WithTest", () => {
  it("with generates CTE", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const rel = Post.all().with("recent_posts", "SELECT * FROM posts WHERE created_at > '2024-01-01'");
    const sql = rel.toSql();
    expect(sql).toContain("WITH");
  });
});
