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

describe("ErrorsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });
  it("can be instantiated with no args", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const p = new Post();
    expect(p.errors).toBeDefined();
    expect(p.errors.empty).toBe(true);
  });
});

describe("error classes", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("find throws RecordNotFound with metadata", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.adapter = adapter;

    try {
      await Item.find(999);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.model).toBe("Item");
      expect(e.primaryKey).toBe("id");
      expect(e.id).toBe(999);
    }
  });

  it("saveBang throws RecordInvalid with record reference", async () => {
    class Widget extends Base { static _tableName = "widgets"; }
    Widget.attribute("id", "integer");
    Widget.attribute("name", "string");
    Widget.validates("name", { presence: true });
    Widget.adapter = adapter;

    const w = new Widget({});
    try {
      await w.saveBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordInvalid);
      expect(e.record).toBe(w);
      expect(e.message).toMatch(/Validation failed/);
    }
  });

  it("readonly record throws ReadOnlyRecord", async () => {
    class Thing extends Base { static _tableName = "things"; }
    Thing.attribute("id", "integer");
    Thing.attribute("name", "string");
    Thing.adapter = adapter;

    const t = await Thing.create({ name: "test" });
    t.readonlyBang();
    try {
      await t.save();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ReadOnlyRecord);
    }
  });

  it("firstBang throws RecordNotFound", async () => {
    class Empty extends Base { static _tableName = "empties"; }
    Empty.attribute("id", "integer");
    Empty.adapter = adapter;

    try {
      await Empty.all().firstBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
    }
  });
});
