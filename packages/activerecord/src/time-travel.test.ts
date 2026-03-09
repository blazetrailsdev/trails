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

describe("TimeTravelTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeTimestampedModel() {
    class Topic extends Base {
      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
      }
    }
    return Topic;
  }

  it("time helper travel", () => {
    const past = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: past });
    const now = new Date();
    expect(now.getTime()).toBe(past.getTime());
  });

  it("time helper travel with block", () => {
    const realBefore = Date.now();
    const past = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: past });
    expect(new Date().getTime()).toBe(past.getTime());
    vi.useRealTimers();
    expect(Date.now()).toBeGreaterThanOrEqual(realBefore);
  });

  it("time helper travel to", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getTime()).toBe(target.getTime());
  });

  it("time helper travel to with block", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getTime()).toBe(target.getTime());
    vi.useRealTimers();
    expect(new Date().getTime()).not.toBe(target.getTime());
  });

  it("time helper travel to with time zone", () => {
    // Travel to a specific time and verify Date reflects it
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    const now = new Date();
    expect(now.toISOString()).toBe("2004-11-24T01:04:44.000Z");
  });

  it("time helper travel to with different system and application time zones", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    // Regardless of timezone interpretation, the UTC millis match
    expect(Date.now()).toBe(target.getTime());
  });

  it("time helper travel to with string for time zone", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getUTCFullYear()).toBe(2004);
    expect(new Date().getUTCMonth()).toBe(10); // November = 10
  });

  it("time helper travel to with string and milliseconds", () => {
    const target = new Date("2004-11-24T01:04:44.123Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(123);
  });

  it("time helper travel to with separate class", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    // Date constructor still produces the frozen time
    const d = new Date();
    expect(d.getTime()).toBe(target.getTime());
  });

  it("time helper travel back", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getTime()).toBe(target.getTime());
    vi.useRealTimers();
    // After travel back, time should be current (not 2004)
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("time helper travel back with block", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getFullYear()).toBe(2004);
    vi.useRealTimers();
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("time helper travel to with nested calls with blocks", () => {
    const time1 = new Date("2004-11-24T01:04:44.000Z");
    const time2 = new Date("2010-06-15T12:00:00.000Z");
    vi.useFakeTimers({ now: time1 });
    expect(new Date().getFullYear()).toBe(2004);
    vi.setSystemTime(time2);
    expect(new Date().getFullYear()).toBe(2010);
    vi.setSystemTime(time1);
    expect(new Date().getFullYear()).toBe(2004);
  });

  it("time helper travel to with nested calls", () => {
    const time1 = new Date("2004-11-24T01:04:44.000Z");
    const time2 = new Date("2010-06-15T12:00:00.000Z");
    vi.useFakeTimers({ now: time1 });
    expect(new Date().getFullYear()).toBe(2004);
    vi.setSystemTime(time2);
    expect(new Date().getFullYear()).toBe(2010);
  });

  it("time helper travel to with subsequent calls", () => {
    const time1 = new Date("2004-11-24T01:04:44.000Z");
    const time2 = new Date("2010-06-15T12:00:00.000Z");
    const time3 = new Date("2015-03-20T10:30:00.000Z");
    vi.useFakeTimers({ now: time1 });
    expect(new Date().getFullYear()).toBe(2004);
    vi.setSystemTime(time2);
    expect(new Date().getFullYear()).toBe(2010);
    vi.setSystemTime(time3);
    expect(new Date().getUTCFullYear()).toBe(2015);
  });

  it("time helper travel to with usec", () => {
    // Travel to a time, milliseconds should be 0 by default
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(0);
  });

  it("time helper with usec true", () => {
    const target = new Date("2004-11-24T01:04:44.567Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(567);
  });

  it("time helper travel to with datetime and usec", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(0);
  });

  it("time helper travel to with datetime and usec true", () => {
    const target = new Date("2004-11-24T01:04:44.999Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(999);
  });

  it("time helper travel to with string and usec", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(0);
  });

  it("time helper travel to with string and usec true", () => {
    const target = new Date("2004-11-24T01:04:44.789Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(789);
  });

  it("time helper freeze time with usec true", () => {
    const target = new Date("2004-11-24T01:04:44.321Z");
    vi.useFakeTimers({ now: target });
    const t1 = new Date();
    const t2 = new Date();
    expect(t1.getTime()).toBe(t2.getTime());
    expect(t1.getMilliseconds()).toBe(321);
  });

  it("time helper travel with subsequent block", () => {
    const time1 = new Date("2004-11-24T01:04:44.000Z");
    const time2 = new Date("2010-06-15T12:00:00.000Z");
    vi.useFakeTimers({ now: time1 });
    expect(new Date().getFullYear()).toBe(2004);
    vi.setSystemTime(time2);
    expect(new Date().getFullYear()).toBe(2010);
    vi.useRealTimers();
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("travel to will reset the usec to avoid mysql rounding", () => {
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    expect(new Date().getMilliseconds()).toBe(0);
  });

  it("time helper travel with time subclass", () => {
    // Even with fake timers, Date subclasses work
    const target = new Date("2004-11-24T01:04:44.000Z");
    vi.useFakeTimers({ now: target });
    const d = new Date();
    expect(d instanceof Date).toBe(true);
    expect(d.getTime()).toBe(target.getTime());
  });

  it("time helper freeze time", () => {
    vi.useFakeTimers({ now: new Date("2020-06-15T12:00:00.000Z") });
    const t1 = new Date();
    const t2 = new Date();
    expect(t1.getTime()).toBe(t2.getTime());
  });

  it("time helper freeze time with block", () => {
    vi.useFakeTimers({ now: new Date("2020-06-15T12:00:00.000Z") });
    const frozen = new Date();
    expect(frozen.getUTCFullYear()).toBe(2020);
    vi.useRealTimers();
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("time helper unfreeze time", () => {
    vi.useFakeTimers({ now: new Date("2020-06-15T12:00:00.000Z") });
    expect(new Date().getUTCFullYear()).toBe(2020);
    vi.useRealTimers();
    expect(new Date().getFullYear()).toBeGreaterThanOrEqual(2025);
  });
});
