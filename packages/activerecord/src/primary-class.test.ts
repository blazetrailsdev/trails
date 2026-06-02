import { afterEach, describe, expect, it } from "vitest";
import { Base } from "./base.js";
import { __resetPrimaryAbstractClass } from "./inheritance.js";

class PrimaryAppRecord extends Base {}
PrimaryAppRecord.abstractClass = true;

class AnotherAppRecord extends PrimaryAppRecord {
  static override _abstractClass = true;
}

class ApplicationRecord extends Base {
  static override _abstractClass = true;
}

describe("PrimaryClassTest", () => {
  afterEach(() => {
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

  // Both tests are gated behind Rails' `unless in_memory_db?` (primary_class_test.rb):
  // they call `connects_to(database: { writing: :arunit, reading: :arunit })` and
  // assert the new pool shares ActiveRecord::Base's connection. With an in-memory
  // SQLite database each `connects_to` pool is an independent `:memory:` DB, so the
  // connections are never equal — which is exactly why Rails skips them in-memory.
  // Our default suite is in-memory SQLite (see Story 4.2 / MultipleDbTest), so they
  // stay skipped here too; the second named pool (ARUnit2Model) itself is wired up.
  it.skip("application record shares a connection with active record by default", () => {});

  it.skip("application record shares a connection with the primary abstract class if set", () => {});
});
