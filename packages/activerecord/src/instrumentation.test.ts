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

describe("InstrumentationTest", () => {
  afterEach(() => { Notifications.unsubscribeAll(); });

  it("instrument returns block result", () => {
    const result = Notifications.instrument("test.event", {}, () => 42);
    expect(result).toBe(42);
  });

  it("instrument yields the payload for further modification", () => {
    let captured: Record<string, unknown> = {};
    Notifications.subscribe("test.payload", (event) => { captured = { ...event.payload }; });
    const payload: Record<string, unknown> = { key: "value" };
    Notifications.instrument("test.payload", payload, () => {
      payload.extra = "added";
    });
    expect(captured.key).toBe("value");
    expect(captured.extra).toBe("added");
  });

  it("instrumenter exposes its id", () => {
    let eventId: string | undefined;
    Notifications.subscribe("test.id", (event) => { eventId = event.transactionId; });
    Notifications.instrument("test.id", {});
    expect(typeof eventId).toBe("string");
    expect(eventId!.length).toBeGreaterThan(0);
  });

  it("nested events can be instrumented", () => {
    const events: string[] = [];
    Notifications.subscribe("outer", (event) => {
      events.push("outer");
      expect(event.children.length).toBe(1);
      expect(event.children[0].name).toBe("inner");
    });
    Notifications.subscribe("inner", (event) => { events.push("inner"); });
    Notifications.instrument("outer", {}, () => {
      Notifications.instrument("inner", {}, () => {});
    });
    expect(events).toContain("outer");
    expect(events).toContain("inner");
  });

  it("instrument publishes when exception is raised", () => {
    let published = false;
    Notifications.subscribe("test.error", () => { published = true; });
    expect(() => {
      Notifications.instrument("test.error", {}, () => { throw new Error("boom"); });
    }).toThrow("boom");
    expect(published).toBe(true);
  });

  it("event is pushed even without block", () => {
    let published = false;
    Notifications.subscribe("test.noblock", () => { published = true; });
    Notifications.instrument("test.noblock", { data: 1 });
    expect(published).toBe(true);
  });
});
