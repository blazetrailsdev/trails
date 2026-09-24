import { afterEach, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { __resetPrimaryAbstractClass } from "./inheritance.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { fixtures } from "./test-fixtures.js";

class PrimaryAppRecord extends Base {}
PrimaryAppRecord.abstractClass = true;

class AnotherAppRecord extends PrimaryAppRecord {
  static override _abstractClass = true;
}

class ApplicationRecord extends Base {
  static override _abstractClass = true;
}

describe("PrimaryClassTest", () => {
  fixtures({}, { useTransactionalTests: false });

  function cleanUpConnectionHandler(): void {
    const managers: Map<string, { roleNames: string[]; removeRole(role: string): unknown }> = (
      Base.connectionHandler as unknown as {
        _connectionNameToPoolManager: Map<string, never>;
      }
    )._connectionNameToPoolManager as never;
    for (const [, poolManager] of managers) {
      for (const role of [...poolManager.roleNames]) {
        if (role !== Base.defaultRole) poolManager.removeRole(role);
      }
    }
  }

  afterEach(() => {
    cleanUpConnectionHandler();
    __resetPrimaryAbstractClass();
    delete (globalThis as Record<string, unknown>)["ApplicationRecord"];
  });

  it("application record is used if no primary class is set", () => {
    (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;

    expect(ApplicationRecord.isPrimaryClass()).toBeTruthy();
    expect(ApplicationRecord.isApplicationRecordClass()).toBeTruthy();
    expect(ApplicationRecord.abstractClass).toBeTruthy();
  });

  it("primary class and primary abstract class behavior", () => {
    PrimaryAppRecord.primaryAbstractClass();

    expect(PrimaryAppRecord.isPrimaryClass()).toBeTruthy();
    expect(PrimaryAppRecord.isApplicationRecordClass()).toBeTruthy();
    expect(PrimaryAppRecord.abstractClass).toBeTruthy();

    expect(AnotherAppRecord.isPrimaryClass()).toBeFalsy();
    expect(AnotherAppRecord.isApplicationRecordClass()).toBeFalsy();
    expect(AnotherAppRecord.abstractClass).toBeTruthy();

    expect(Base.isPrimaryClass()).toBeTruthy();
    expect(Base.isApplicationRecordClass()).toBeFalsy();
    expect(Base.abstractClass).toBeFalsy();
  });

  it("primary abstract class cannot be reset", () => {
    PrimaryAppRecord.primaryAbstractClass();

    expect(() => AnotherAppRecord.primaryAbstractClass()).toThrow();
  });

  it("primary abstract class is used over application record if set", () => {
    PrimaryAppRecord.primaryAbstractClass();
    (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;

    expect(PrimaryAppRecord.isPrimaryClass()).toBeTruthy();
    expect(PrimaryAppRecord.isApplicationRecordClass()).toBeTruthy();
    expect(PrimaryAppRecord.abstractClass).toBeTruthy();

    expect(ApplicationRecord.isPrimaryClass()).toBeFalsy();
    expect(ApplicationRecord.isApplicationRecordClass()).toBeFalsy();
    expect(ApplicationRecord.abstractClass).toBeTruthy();

    expect(Base.isPrimaryClass()).toBeTruthy();
    expect(Base.isApplicationRecordClass()).toBeFalsy();
    expect(Base.abstractClass).toBeFalsy();
  });

  it("setting primary abstract class explicitly wins over application record set implicitly", () => {
    (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;

    expect(ApplicationRecord.isPrimaryClass()).toBeTruthy();
    expect(ApplicationRecord.isApplicationRecordClass()).toBeTruthy();
    expect(ApplicationRecord.abstractClass).toBeTruthy();

    PrimaryAppRecord.primaryAbstractClass();

    expect(PrimaryAppRecord.isPrimaryClass()).toBeTruthy();
    expect(PrimaryAppRecord.isApplicationRecordClass()).toBeTruthy();
    expect(PrimaryAppRecord.abstractClass).toBeTruthy();

    expect(ApplicationRecord.isPrimaryClass()).toBeFalsy();
    expect(ApplicationRecord.isApplicationRecordClass()).toBeFalsy();
    expect(ApplicationRecord.abstractClass).toBeTruthy();
  });

  it.skipIf(inMemoryDb())(
    "application record shares a connection with active record by default",
    async () => {
      (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;
      try {
        await ApplicationRecord.connectsTo({
          database: { writing: ":arunit", reading: ":arunit" },
        });

        expect(ApplicationRecord.isPrimaryClass()).toBeTruthy();
        expect(ApplicationRecord.isApplicationRecordClass()).toBeTruthy();
        expect(await ApplicationRecord.leaseConnection()).toBe(await Base.leaseConnection());
      } finally {
        await ApplicationRecord.removeConnection();
        await Base.establishConnection(":arunit");
      }
    },
  );

  it.skipIf(inMemoryDb())(
    "application record shares a connection with the primary abstract class if set",
    async () => {
      PrimaryAppRecord.primaryAbstractClass();
      try {
        await PrimaryAppRecord.connectsTo({
          database: { writing: ":arunit", reading: ":arunit" },
        });

        expect(PrimaryAppRecord.isPrimaryClass()).toBeTruthy();
        expect(PrimaryAppRecord.isApplicationRecordClass()).toBeTruthy();
        expect(PrimaryAppRecord.abstractClass).toBeTruthy();
        expect(await PrimaryAppRecord.leaseConnection()).toBe(await Base.leaseConnection());
      } finally {
        await PrimaryAppRecord.removeConnection();
        await Base.establishConnection(":arunit");
      }
    },
  );
});
