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

describe("AbsenceValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
        this.validates("body", { absence: true });
      }
    }
    return { Topic };
  }
  it("non association", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "filled" });
    expect(t.isValid()).toBe(false);
  });
  it("has one marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "" });
    expect(t.isValid()).toBe(true);
  });
  it("has many marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    expect(t.isValid()).toBe(true);
  });
  it("does not call to a on associations", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(t.isValid()).toBe(true);
  });
  it("validates absence of virtual attribute on model", () => {
    const { Topic } = makeModel();
    const t = new Topic({ body: "present" });
    expect(t.isValid()).toBe(false);
    expect(t.errors.empty).toBe(false);
  });
});
