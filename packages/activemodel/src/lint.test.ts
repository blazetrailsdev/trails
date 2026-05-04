import { describe, expect, it } from "vitest";
import { testErrorsAref, testModelNaming, testToKey, testToParam } from "./lint.js";

type KeyFixture = {
  isPersisted(): boolean;
  toKey(): unknown[] | null;
};

function buildKeyFixture(): KeyFixture {
  const fixture: KeyFixture = {
    isPersisted() {
      return true;
    },
    toKey(this: KeyFixture) {
      return this.isPersisted() ? [1] : null;
    },
  };
  return fixture;
}

describe("Lint::Tests", () => {
  describe("testToKey", () => {
    it("passes when persisted returns key and unpersisted returns null", () => {
      expect(() => testToKey(buildKeyFixture())).not.toThrow();
    });

    it("throws when toKey returns non-null while unpersisted", () => {
      const broken: KeyFixture = {
        isPersisted: () => true,
        toKey: () => [1],
      };
      expect(() => testToKey(broken)).toThrow(/null when `isPersisted` returns false/);
    });

    it("restores isPersisted after running", () => {
      const fixture = buildKeyFixture();
      const before = fixture.isPersisted;
      testToKey(fixture);
      expect(fixture.isPersisted).toBe(before);
      expect(fixture.isPersisted()).toBe(true);
    });
  });

  describe("testToParam", () => {
    it("passes when toParam returns null in unpersisted branch", () => {
      type ParamFixture = {
        isPersisted(): boolean;
        toKey(): unknown[] | null;
        toParam(): string | null;
      };
      const fixture: ParamFixture = {
        isPersisted() {
          return true;
        },
        toKey(this: ParamFixture) {
          return this.isPersisted() ? [1] : null;
        },
        toParam(this: ParamFixture) {
          if (!this.isPersisted()) return null;
          const key = this.toKey();
          return key === null ? null : String(key[0]);
        },
      };
      expect(() => testToParam(fixture)).not.toThrow();
      expect(fixture.isPersisted()).toBe(true);
    });

    it("throws when toParam is non-null while unpersisted", () => {
      const broken = {
        isPersisted: () => true,
        toKey: () => [1] as unknown[],
        toParam: () => "1",
      };
      expect(() => testToParam(broken)).toThrow(/null when `isPersisted` returns false/);
    });
  });

  describe("testModelNaming", () => {
    const goodName = { human: "Foo", singular: "foo", plural: "foos" };

    it("passes when instance.modelName === constructor.modelName", () => {
      const fixture = { modelName: goodName, constructor: { modelName: goodName } };
      expect(() => testModelNaming(fixture)).not.toThrow();
    });

    it("throws when instance.modelName diverges from constructor.modelName", () => {
      const fixture = {
        modelName: { ...goodName },
        constructor: { modelName: goodName },
      };
      expect(() => testModelNaming(fixture)).toThrow(
        /modelName must equal model\.constructor\.modelName/,
      );
    });
  });

  describe("testErrorsAref", () => {
    it("passes when errors.get returns an array", () => {
      expect(() => testErrorsAref({ errors: { get: () => [] } })).not.toThrow();
    });

    it("throws when errors.get returns a non-array", () => {
      const broken = { errors: { get: () => "nope" as unknown as string[] } };
      expect(() => testErrorsAref(broken)).toThrow(/must return an array/);
    });
  });
});
