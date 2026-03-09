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
// WhereClauseTest — targets relation/where_clause_test.rb
// ==========================================================================
describe("WhereClauseTest", () => {
  it("where with hash produces sql", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: "hello" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("where not with hash produces negation", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.all().whereNot({ title: "hello" }).toSql();
    expect(sql).toContain("!=");
  });
});
