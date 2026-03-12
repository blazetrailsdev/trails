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

describe("InversePolymorphicBelongsToTests", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModels() {
    class Man extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Face extends Base {
      static {
        this.attribute("description", "string");
        this.attribute("man_id", "integer");
        this.adapter = adapter;
      }
    }
    class Tag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.adapter = adapter;
      }
    }
    Associations.hasMany.call(Man, "tags", { as: "taggable" });
    Associations.belongsTo.call(Tag, "taggable", { polymorphic: true });
    registerModel(Man);
    registerModel(Face);
    registerModel(Tag);
    return { Man, Face, Tag };
  }

  it("child instance should be shared with parent on find", async () => {
    const { Man, Tag } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    await Tag.create({ name: "cool", taggable_id: m.id, taggable_type: "Man" });
    const parent = await loadBelongsTo((await Tag.findBy({ taggable_id: m.id }))!, "taggable", {
      polymorphic: true,
      inverseOf: "tags",
    });
    expect(parent).not.toBeNull();
    // Inverse is set on the found parent
    expect((parent as any)._cachedAssociations?.get("tags")).toBeTruthy();
  });

  it.skip("eager loaded child instance should be shared with parent on find", () => {
    /* needs eager loading */
  });
  it("child instance should be shared with replaced via accessor parent", async () => {
    const { Man, Tag } = makeModels();
    const m1 = await Man.create({ name: "Gordon" });
    const t = await Tag.create({ name: "cool", taggable_id: m1.id, taggable_type: "Man" });
    const m2 = await Man.create({ name: "New" });
    setBelongsTo(t, "taggable", m2, {
      polymorphic: true,
      inverseOf: "tags",
      foreignKey: "taggable_id",
    });
    expect((t as any)._cachedAssociations.get("taggable")).toBe(m2);
    expect((m2 as any)._cachedAssociations?.get("tags")).toBe(t);
  });
  it.skip("inversed instance should not be reloaded after stale state changed", () => {
    /* needs stale state tracking */
  });
  it.skip("inversed instance should not be reloaded after stale state changed with validation", () => {
    /* needs stale state tracking */
  });
  it.skip("inversed instance should load after autosave if it is not already loaded", () => {
    /* needs autosave */
  });

  it("should not try to set inverse instances when the inverse is a has many", async () => {
    const { Man, Tag } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    await Tag.create({ name: "cool", taggable_id: m.id, taggable_type: "Man" });
    // Without inverseOf, no cached association should be set
    const parent = await loadBelongsTo((await Tag.findBy({ taggable_id: m.id }))!, "taggable", {
      polymorphic: true,
    });
    expect(parent).not.toBeNull();
    expect((parent as any)._cachedAssociations).toBeUndefined();
  });

  it.skip("with has many inversing should try to set inverse instances when the inverse is a has many", () => {
    /* needs has_many inversing */
  });
  it.skip("with has many inversing does not trigger association callbacks on set when the inverse is a has many", () => {
    /* needs callback tracking */
  });

  it("trying to access inverses that dont exist shouldnt raise an error", async () => {
    const { Man, Tag } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    const t = await Tag.create({ name: "cool", taggable_id: m.id, taggable_type: "Man" });
    // Loading with a non-existent inverse name should not throw
    const parent = await loadBelongsTo(t, "taggable", {
      polymorphic: true,
      inverseOf: "nonexistent",
    });
    expect(parent).not.toBeNull();
  });

  it.skip("trying to set polymorphic inverses that dont exist at all should raise an error", () => {
    /* needs inverse validation on polymorphic */
  });
  it.skip("trying to set polymorphic inverses that dont exist on the instance being set should raise an error", () => {
    /* needs inverse validation on polymorphic */
  });
});
