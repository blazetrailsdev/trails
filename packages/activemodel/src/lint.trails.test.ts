import { describe, expect, it } from "vitest";
import { Assertion } from "@blazetrails/activesupport";
import {
  testErrorsAref,
  testModelNaming,
  testPersisted,
  testToKey,
  testToParam,
  testToPartialPath,
} from "./lint.js";

function toModel<T>(this: T): T {
  return this;
}

describe("Lint::Tests", () => {
  describe("minitest assertions", () => {
    it("fails with minitest's assert_respond_to message", () => {
      expect(() => testToKey({ toModel: () => ({}) as never })).toThrow(/to respond to #toKey/);
      expect(() => testToKey({} as never)).toThrow(/to respond to #toModel/);
    });

    it("fails with minitest's assert_kind_of message", () => {
      const fixture = { toPartialPath: () => 1 as unknown as string, toModel };
      expect(() => testToPartialPath(fixture)).toThrow(
        "Expected 1 to be a kind of String, not Integer.",
      );
      const compliant = { toPartialPath: () => "people/person", toModel };
      expect(() => testToPartialPath(compliant)).not.toThrow();
    });

    it("fails assert_boolean with Rails' message", () => {
      const fixture = { isPersisted: () => null as unknown as boolean, toModel };
      expect(() => testPersisted(fixture)).toThrow("persisted? should be a boolean");
    });
  });

  describe("a non-compliant model", () => {
    it("fails when toKey returns non-null while unpersisted", () => {
      const broken = { isPersisted: () => true, toKey: () => [1] as unknown[] | null, toModel };
      expect(() => testToKey(broken)).toThrow(
        "to_key should return nil when `persisted?` returns false",
      );
    });

    it("fails when toParam is non-null while unpersisted", () => {
      const broken = {
        isPersisted: () => true,
        toKey: () => [1] as unknown[] | null,
        toParam: () => "1" as string | null,
        toModel,
      };
      expect(() => testToParam(broken)).toThrow(
        "to_param should return nil when `persisted?` returns false",
      );
    });

    it("fails when instance.modelName diverges from constructor.modelName", () => {
      const goodName = { human: () => "Foo", singular: "foo", plural: "foos" };
      const fixture = {
        modelName: { ...goodName, singular: "bar" },
        constructor: { modelName: goodName },
        toModel,
      };
      expect(() => testModelNaming(fixture)).toThrow(Assertion);
    });

    it("fails when errors#[] returns a non-array", () => {
      const broken = { errors: { get: () => "nope" }, toModel };
      expect(() => testErrorsAref(broken)).toThrow(/errors#\[\] should return an empty Array/);
    });
  });
});
