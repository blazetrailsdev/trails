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

  it.skip("application record shares a connection with active record by default", () => {
    // Requires multi-DB named config (arunit) — not available in in-memory test env
  });

  it.skip("application record shares a connection with the primary abstract class if set", () => {
    // Requires multi-DB named config (arunit) — not available in in-memory test env
  });
});
