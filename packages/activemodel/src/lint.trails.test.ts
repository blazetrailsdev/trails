import { describe, expect, it } from "vitest";
import { testPersisted, testToKey, testToPartialPath } from "./lint.js";

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
});
