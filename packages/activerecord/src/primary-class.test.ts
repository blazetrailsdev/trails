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
  // Rails: `self.use_transactional_tests = false` (primary_class_test.rb:6).
  // The connects_to tests below need a live primary connection to share.
  fixtures({}, { useTransactionalTests: false });

  // Mirrors ActiveRecord::TestCase#clean_up_connection_handler (Rails'
  // per-test `teardown { clean_up_connection_handler }`, primary_class_test.rb:8):
  // drop every non-default (e.g. :reading) role the connects_to tests
  // established, leaving the writing pool.
  function cleanUpConnectionHandler(): void {
    const managers: Map<string, { roleNames: string[]; removeRole(role: string): boolean }> = (
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

    expect(ApplicationRecord.primaryClassQ()).toBe(true);
    expect(ApplicationRecord.applicationRecordClassQ()).toBe(true);
    expect(ApplicationRecord.abstractClass).toBe(true);
  });

  it("primary class and primary abstract class behavior", () => {
    PrimaryAppRecord.primaryAbstractClass();

    expect(PrimaryAppRecord.primaryClassQ()).toBe(true);
    expect(PrimaryAppRecord.applicationRecordClassQ()).toBe(true);
    expect(PrimaryAppRecord.abstractClass).toBe(true);

    expect(AnotherAppRecord.primaryClassQ()).toBe(false);
    expect(AnotherAppRecord.applicationRecordClassQ()).toBe(false);
    expect(AnotherAppRecord.abstractClass).toBe(true);

    expect(Base.primaryClassQ()).toBe(true);
    expect(Base.applicationRecordClassQ()).toBe(false);
    expect(Base.abstractClass).toBe(false);
  });

  it("primary abstract class cannot be reset", () => {
    PrimaryAppRecord.primaryAbstractClass();

    expect(() => AnotherAppRecord.primaryAbstractClass()).toThrow();
  });

  it("primary abstract class is used over application record if set", () => {
    PrimaryAppRecord.primaryAbstractClass();
    (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;

    expect(PrimaryAppRecord.primaryClassQ()).toBe(true);
    expect(PrimaryAppRecord.applicationRecordClassQ()).toBe(true);
    expect(PrimaryAppRecord.abstractClass).toBe(true);

    expect(ApplicationRecord.primaryClassQ()).toBe(false);
    expect(ApplicationRecord.applicationRecordClassQ()).toBe(false);
    expect(ApplicationRecord.abstractClass).toBe(true);

    expect(Base.primaryClassQ()).toBe(true);
    expect(Base.applicationRecordClassQ()).toBe(false);
    expect(Base.abstractClass).toBe(false);
  });

  it("setting primary abstract class explicitly wins over application record set implicitly", () => {
    (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;

    expect(ApplicationRecord.primaryClassQ()).toBe(true);
    expect(ApplicationRecord.applicationRecordClassQ()).toBe(true);
    expect(ApplicationRecord.abstractClass).toBe(true);

    PrimaryAppRecord.primaryAbstractClass();

    expect(PrimaryAppRecord.primaryClassQ()).toBe(true);
    expect(PrimaryAppRecord.applicationRecordClassQ()).toBe(true);
    expect(PrimaryAppRecord.abstractClass).toBe(true);

    expect(ApplicationRecord.primaryClassQ()).toBe(false);
    expect(ApplicationRecord.applicationRecordClassQ()).toBe(false);
    expect(ApplicationRecord.abstractClass).toBe(true);
  });

  it.skipIf(inMemoryDb())(
    "application record shares a connection with active record by default",
    async () => {
      (globalThis as Record<string, unknown>)["ApplicationRecord"] = ApplicationRecord;
      try {
        const pools = ApplicationRecord.connectsTo({
          database: { writing: "arunit", reading: "arunit" },
        });
        await Promise.all(pools.map((p) => p.adapterReady));

        expect(ApplicationRecord.primaryClassQ()).toBe(true);
        expect(ApplicationRecord.applicationRecordClassQ()).toBe(true);
        expect(await ApplicationRecord.leaseConnection()).toBe(await Base.leaseConnection());
      } finally {
        ApplicationRecord.removeConnection();
        await Base.establishConnection("arunit");
      }
    },
  );

  it.skipIf(inMemoryDb())(
    "application record shares a connection with the primary abstract class if set",
    async () => {
      PrimaryAppRecord.primaryAbstractClass();
      try {
        const pools = PrimaryAppRecord.connectsTo({
          database: { writing: "arunit", reading: "arunit" },
        });
        await Promise.all(pools.map((p) => p.adapterReady));

        expect(PrimaryAppRecord.primaryClassQ()).toBe(true);
        expect(PrimaryAppRecord.applicationRecordClassQ()).toBe(true);
        expect(PrimaryAppRecord.abstractClass).toBe(true);
        expect(await PrimaryAppRecord.leaseConnection()).toBe(await Base.leaseConnection());
      } finally {
        PrimaryAppRecord.removeConnection();
        await Base.establishConnection("arunit");
      }
    },
  );
});
