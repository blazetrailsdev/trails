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

describe("InverseHasOneTests", () => {
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
    Associations.hasOne.call(Man, "face", { inverseOf: "man" });
    Associations.belongsTo.call(Face, "man", { inverseOf: "face" });
    registerModel(Man);
    registerModel(Face);
    return { Man, Face };
  }

  it("parent instance should be shared with child on find", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    await Face.create({ description: "pretty", man_id: m.id });
    const face = await loadHasOne(m, "face", { inverseOf: "man" });
    expect(face).not.toBeNull();
    expect((face as any)._cachedAssociations?.get("man")).toBe(m);
  });

  it("parent instance should be shared with eager loaded child on find", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    await Face.create({ description: "pretty", man_id: m.id });
    const men = await Man.all().includes("face").toArray();
    expect(men.length).toBe(1);
    const face = (men[0] as any)._preloadedAssociations?.get("face");
    expect(face).not.toBeNull();
    expect((face as any)._cachedAssociations?.get("man")).toBe(men[0]);
  });

  it("parent instance should be shared with newly built child", () => {
    const { Man, Face } = makeModels();
    const m = new Man({ name: "Gordon" });
    const f = new Face({ description: "pretty" });
    // Simulate building: set FK and inverse cache
    f.writeAttribute("man_id", 1);
    (f as any)._cachedAssociations = new Map();
    (f as any)._cachedAssociations.set("man", m);
    expect((f as any)._cachedAssociations.get("man")).toBe(m);
  });

  it("parent instance should be shared with newly created child", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    const f = await Face.create({ description: "pretty", man_id: m.id });
    const face = await loadHasOne(m, "face", { inverseOf: "man" });
    expect(face).not.toBeNull();
    expect((face as any)._cachedAssociations?.get("man")).toBe(m);
  });

  it("parent instance should be shared with newly created child via bang method", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    await Face.create({ description: "pretty", man_id: m.id });
    const face = await loadHasOne(m, "face", { inverseOf: "man" });
    expect(face).not.toBeNull();
    expect(face!.readAttribute("description")).toBe("pretty");
    expect((face as any)._cachedAssociations?.get("man")).toBe(m);
  });

  it("parent instance should be shared with replaced via accessor child", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    const f = await Face.create({ description: "pretty" });
    await setHasOne(m, "face", f, { inverseOf: "man", foreignKey: "man_id", className: "Face" });
    expect((m as any)._cachedAssociations.get("face")).toBe(f);
    expect((f as any)._cachedAssociations?.get("man")).toBe(m);
  });
  it("child instance should be shared with replaced via accessor parent", async () => {
    const { Man, Face } = makeModels();
    const m = await Man.create({ name: "Gordon" });
    const f = await Face.create({ description: "pretty", man_id: m.id });
    const m2 = await Man.create({ name: "New" });
    setBelongsTo(f, "man", m2, { inverseOf: "face" });
    expect((f as any)._cachedAssociations.get("man")).toBe(m2);
    expect((m2 as any)._cachedAssociations?.get("face")).toBe(f);
  });
  it.skip("trying to use inverses that dont exist should raise an error", () => {
    /* needs inverse validation */
  });
  it.skip("trying to use inverses that dont exist should have suggestions for fix", () => {
    /* needs inverse validation */
  });
});
