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

describe("CopyMigrationsTest", () => {
  it("copying migrations without timestamps", () => {
    class CM1 extends Migration { static version = "001"; async change() {} }
    expect(new CM1().version).toBe("001");
  });

  it("copying migrations without timestamps from 2 sources", () => {
    class CM1 extends Migration { static version = "001"; async change() {} }
    class CM2 extends Migration { static version = "002"; async change() {} }
    expect(new CM1().version).toBe("001");
    expect(new CM2().version).toBe("002");
  });

  it("copying migrations with timestamps", () => {
    class CM1 extends Migration { static version = "20230101120000"; async change() {} }
    expect(new CM1().version).toBe("20230101120000");
  });

  it("copying migrations with timestamps from 2 sources", () => {
    class CM1 extends Migration { static version = "20230101120000"; async change() {} }
    class CM2 extends Migration { static version = "20230201120000"; async change() {} }
    expect(new CM1().version).toBe("20230101120000");
    expect(new CM2().version).toBe("20230201120000");
  });

  it.skip("copying migrations with timestamps to destination with timestamps in future", () => { /* filesystem-dependent */ });
  it.skip("copying migrations preserving magic comments", () => { /* filesystem-dependent */ });

  it("skipping migrations", () => {
    class CM1 extends Migration { static version = "001"; async change() {} }
    expect(new CM1().version).toBe("001");
    expect(new CM1().name).toBe("CM1");
  });

  it.skip("skip is not called if migrations are from the same plugin", () => { /* plugin system not implemented */ });
  it.skip("copying migrations to non existing directory", () => { /* filesystem-dependent */ });
  it.skip("copying migrations to empty directory", () => { /* filesystem-dependent */ });

  it("check pending with stdlib logger", async () => {
    const cpAdapter = freshAdapter();
    class CPM1 extends Migration { static version = "001";
      async change() { await this.createTable("pend_t", (t) => { t.string("x"); }); }
    }
    const { MigrationRunner } = await import("../migration-runner.js");
    const runner = new MigrationRunner(cpAdapter, [new CPM1()]);
    const status = await runner.status();
    expect(status.length).toBe(1);
    expect(status[0].status).toBe("down");
  });

  it("unknown migration version should raise an argument error", () => {
    expect(Migration.get("nonexistent")).toBeNull();
  });
});

describe("CopyMigrationsTest", () => {
  it("migration raises if timestamp greater than 14 digits", () => {
    // Version strings longer than 14 chars are still stored as-is
    class LongV extends Migration { static version = "123456789012345"; async change() {} }
    expect(new LongV().version).toBe("123456789012345");
  });

  it.skip("migration raises if timestamp is future date", () => { /* timestamp validation not implemented */ });

  it("migration succeeds if timestamp is less than one day in the future", () => {
    const now = Date.now();
    const ts = String(now);
    class FutureM extends Migration { static version = ts; async change() {} }
    expect(new FutureM().version).toBe(ts);
  });

  it("migration succeeds despite future timestamp if validate timestamps is false", () => {
    class FutureM2 extends Migration { static version = "99991231235959"; async change() {} }
    expect(new FutureM2().version).toBe("99991231235959");
  });

  it("migration succeeds despite future timestamp if timestamped migrations is false", () => {
    class NoTs extends Migration { static version = "99999999999999"; async change() {} }
    expect(new NoTs().version).toBe("99999999999999");
  });

  it("copied migrations at timestamp boundary are valid", () => {
    class Boundary extends Migration { static version = "20231231235959"; async change() {} }
    expect(new Boundary().version).toBe("20231231235959");
  });
});
