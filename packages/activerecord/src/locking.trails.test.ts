import { describe, it, expect } from "vitest";

import { Base } from "./base.js";
import { LockingType } from "./locking/optimistic.js";
import { fixtures } from "./test-helpers/fixtures.js";

describe("OptimisticLockingTrailsTest", () => {
  fixtures([]);

  it("locking_column= reloads the schema so reflected types pick up the new column", async () => {
    class LockCust extends Base {
      static {
        this._tableName = "lock_without_defaults_cust";
      }
    }
    await LockCust.loadSchema();
    expect(LockCust.typeForAttribute("custom_lock_version")).not.toBeInstanceOf(LockingType);

    LockCust.lockingColumn = "custom_lock_version";
    await LockCust.loadSchema();
    expect(LockCust.typeForAttribute("custom_lock_version")).toBeInstanceOf(LockingType);

    const record = new LockCust();
    expect(record.readAttribute("custom_lock_version")).toBe(0);
  });

  it("locking_column= stores value.to_s", () => {
    class LockCoerce extends Base {
      static {
        this._tableName = "lock_without_defaults";
      }
    }

    const untyped = LockCoerce as unknown as { lockingColumn: unknown };

    untyped.lockingColumn = 123;
    expect(LockCoerce.lockingColumn).toBe("123");

    // Ruby's nil.to_s is "", so the reader yields "" rather than falling back
    // to the "lock_version" default.
    untyped.lockingColumn = null;
    expect(LockCoerce.lockingColumn).toBe("");
  });
});
