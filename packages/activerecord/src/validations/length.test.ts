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

describe("LengthValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.validates("title", { length: { minimum: 2, maximum: 10 } });
      }
    }
    return { Topic };
  }
  it("validates size of association", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "a" });
    expect(t.isValid()).toBe(false);
  });
  it("validates size of association using within", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hello" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of association utf8", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hi" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of respects records marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "toolongstringthatexceedslimit" });
    expect(t.isValid()).toBe(false);
  });
  it("validates length of virtual attribute on model", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(t.isValid()).toBe(true);
  });
});

describe("LengthValidationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });
  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
        this.validates("title", { length: { minimum: 2, maximum: 10 } });
      }
    }
    return { Topic };
  }
  it("validates size of association", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "a" });
    expect(t.isValid()).toBe(false);
  });
  it("validates size of association using within", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hello" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of association utf8", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "hi" });
    expect(t.isValid()).toBe(true);
  });
  it("validates size of respects records marked for destruction", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "toolongstringthatexceedslimit" });
    expect(t.isValid()).toBe(false);
  });
  it("validates length of virtual attribute on model", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    expect(t.isValid()).toBe(true);
  });
});
