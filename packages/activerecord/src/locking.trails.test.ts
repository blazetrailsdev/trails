import { describe, it, expect } from "vitest";

import { Base } from "./base.js";
import { RecordNotFound } from "./errors.js";
import { LockingType } from "./locking/optimistic.js";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Person } from "./test-helpers/models/person.js";

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

  it("a subclass reads the default locking_column, not its parent's", () => {
    class LockParent extends Base {
      static {
        this._tableName = "lock_without_defaults_cust";
        this.lockingColumn = "custom_lock_version";
      }
    }
    class LockChild extends LockParent {}

    expect(LockParent.lockingColumn).toBe("custom_lock_version");
    expect(LockChild.lockingColumn).toBe("lock_version");
  });

  it("hook_attribute_type leaves the type alone when lock_optimistically is nil", async () => {
    class LockOff extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.lockOptimistically = null as never;
      }
    }
    await LockOff.loadSchema();
    expect(LockOff.typeForAttribute("lock_version")).not.toBeInstanceOf(LockingType);
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

    untyped.lockingColumn = null;
    expect(LockCoerce.lockingColumn).toBe("");
  });
});

describe("OptimisticLockingTrailsTest", () => {
  fixtures(["people"]);

  it("touch with dirty primary key", async () => {
    const before = await Person.find(1);
    const beforeLockVersion = before.lock_version;

    const person = await Person.find(1);
    person.id = 42;
    expect(await person.touch()).toBe(true);

    const persisted = await Person.find(1);
    expect(persisted.lock_version).toBe(beforeLockVersion + 1);
    await expect(Person.find(42)).rejects.toBeInstanceOf(RecordNotFound);
  });
});
