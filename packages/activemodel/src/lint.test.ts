import { describe, expect, it } from "vitest";
import { Assertion } from "@blazetrails/activesupport";
import { testErrorsAref, testModelNaming, testToKey, testToParam } from "./lint.js";

type KeyFixture = {
  isPersisted(): boolean;
  toKey(): unknown[] | null;
  toModel(): KeyFixture;
};

function toModel<T>(this: T): T {
  return this;
}

function buildKeyFixture(): KeyFixture {
  const fixture: KeyFixture = {
    isPersisted() {
      return true;
    },
    toKey(this: KeyFixture) {
      return this.isPersisted() ? [1] : null;
    },
    toModel,
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
        toModel,
      };
      expect(() => testToKey(broken)).toThrow(
        "to_key should return nil when `persisted?` returns false",
      );
    });
  });

  describe("testToParam", () => {
    it("passes when toParam returns null in unpersisted branch", () => {
      type ParamFixture = {
        isPersisted(): boolean;
        toKey(): unknown[] | null;
        toParam(): string | null;
        toModel(): ParamFixture;
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
        toModel,
      };
      expect(() => testToParam(fixture)).not.toThrow();
    });

    it("throws when toParam is non-null while unpersisted", () => {
      const broken = {
        isPersisted: () => true,
        toKey: () => [1] as unknown[],
        toParam: () => "1",
        toModel,
      };
      expect(() => testToParam(broken)).toThrow(
        "to_param should return nil when `persisted?` returns false",
      );
    });
  });

  describe("testModelNaming", () => {
    const goodName = { human: () => "Foo", singular: "foo", plural: "foos" };

    it("passes when instance.modelName === constructor.modelName", () => {
      const fixture = { modelName: goodName, constructor: { modelName: goodName }, toModel };
      expect(() => testModelNaming(fixture)).not.toThrow();
    });

    it("throws when instance.modelName diverges from constructor.modelName", () => {
      const fixture = {
        modelName: { ...goodName, singular: "bar" },
        constructor: { modelName: goodName },
        toModel,
      };
      expect(() => testModelNaming(fixture)).toThrow(Assertion);
    });
  });

  describe("testErrorsAref", () => {
    it("passes when errors.messagesFor returns an array", () => {
      const fixture = { errors: { get: () => [] }, toModel };
      expect(() => testErrorsAref(fixture)).not.toThrow();
    });

    it("throws when errors.messagesFor returns a non-array", () => {
      const broken = { errors: { get: () => "nope" }, toModel };
      expect(() => testErrorsAref(broken)).toThrow(/errors#\[\] should return an empty Array/);
    });
  });
});
