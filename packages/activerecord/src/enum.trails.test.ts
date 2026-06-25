/**
 * trails-specific invariants for the internal enum validators — these guard
 * behavior with no Rails enum_test.rb counterpart (the private helpers
 * `assertValidEnumDefinitionValues`, `assertValidEnumOptions`,
 * `detectNegativeEnumConditionsBang`, and the `setEnumWarn` warning hook).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  assertValidEnumDefinitionValues,
  assertValidEnumOptions,
  detectNegativeEnumConditionsBang,
  setEnumWarn,
} from "./enum.js";
import { ArgumentError } from "@blazetrails/activemodel";

describe("Enum private validators", () => {
  afterEach(() => vi.restoreAllMocks());

  describe("assertValidEnumDefinitionValues", () => {
    it("rejects empty array with ArgumentError", () => {
      expect(() => assertValidEnumDefinitionValues([])).toThrow(ArgumentError);
    });
    it("rejects array with non-string entries", () => {
      expect(() => assertValidEnumDefinitionValues([1, 2])).toThrow(ArgumentError);
    });
    it("accepts array with string entries", () => {
      const out = assertValidEnumDefinitionValues(["draft", "published"]);
      expect(out).toEqual(["draft", "published"]);
    });
    it("accepts array with symbol entries", () => {
      const sym1 = Symbol("draft");
      const sym2 = Symbol("published");
      const out = assertValidEnumDefinitionValues([sym1, sym2]);
      expect(out).toEqual([sym1, sym2]);
    });
    it("rejects array with blank name", () => {
      expect(() => assertValidEnumDefinitionValues(["a", ""])).toThrow(/blank name/);
    });
    it("rejects array with whitespace-only name", () => {
      expect(() => assertValidEnumDefinitionValues(["a", "   "])).toThrow(/blank name/);
    });
    it("rejects hash with whitespace-only key", () => {
      expect(() => assertValidEnumDefinitionValues({ "   ": 1 })).toThrow(/blank name/);
    });
    it("rejects array with blank-description Symbol", () => {
      expect(() => assertValidEnumDefinitionValues([Symbol("")])).toThrow(/blank name/);
      expect(() => assertValidEnumDefinitionValues([Symbol("   ")])).toThrow(/blank name/);
    });
    it("rejects non-plain-object values (Map/Date/class instances)", () => {
      expect(() => assertValidEnumDefinitionValues(new Map())).toThrow(
        /non-empty hash or an array/,
      );
      expect(() => assertValidEnumDefinitionValues(new Date())).toThrow(
        /non-empty hash or an array/,
      );
      class Foo {}
      expect(() => assertValidEnumDefinitionValues(new Foo())).toThrow(
        /non-empty hash or an array/,
      );
    });
    it("rejects empty hash", () => {
      expect(() => assertValidEnumDefinitionValues({})).toThrow(ArgumentError);
    });
    it("accepts hash with boolean and null values", () => {
      const out = assertValidEnumDefinitionValues({ a: true, b: null, c: 1 });
      expect(out).toEqual({ a: true, b: null, c: 1 });
    });
    it("rejects hash with non-primitive value", () => {
      expect(() => assertValidEnumDefinitionValues({ a: { x: 1 } })).toThrow(ArgumentError);
    });
    it("accepts hash with symbol keys (Reflect.ownKeys)", () => {
      const out = assertValidEnumDefinitionValues({ [Symbol("draft")]: 0 });
      expect(out).toBeDefined();
    });
    it("rejects hash with blank-description symbol key", () => {
      expect(() => assertValidEnumDefinitionValues({ [Symbol("")]: 0 })).toThrow(/blank name/);
    });
    it("rejects hash with NaN or Infinity number values", () => {
      expect(() => assertValidEnumDefinitionValues({ a: NaN })).toThrow(/finite numbers/);
      expect(() => assertValidEnumDefinitionValues({ a: Infinity })).toThrow(/finite numbers/);
    });
  });

  describe("assertValidEnumOptions", () => {
    it("rejects underscore-prefixed option keys with ArgumentError (enum.rb:361-365)", () => {
      // Rails: options.keys & %i[_prefix _suffix _scopes _default _instance_methods]
      expect(() => assertValidEnumOptions({ _prefix: "x" })).toThrow(ArgumentError);
      expect(() => assertValidEnumOptions({ _suffix: "x" })).toThrow(/invalid option/);
      expect(() => assertValidEnumOptions({ _scopes: true })).toThrow(/invalid option/);
      expect(() => assertValidEnumOptions({ _default: "active" })).toThrow(/invalid option/);
      expect(() => assertValidEnumOptions({ _instance_methods: false })).toThrow(/invalid option/);
      // _validate is NOT in Rails' invalid list — valid options include :validate
      expect(() => assertValidEnumOptions({ _validate: true })).not.toThrow();
    });
    it("error message uses Ruby symbol inspect format (:key)", () => {
      expect(() => assertValidEnumOptions({ _prefix: "x" })).toThrow(/:_prefix/);
    });
    it("accepts valid options without throwing", () => {
      expect(() => assertValidEnumOptions({ prefix: "x", validate: true })).not.toThrow();
    });
    it("treats arrays as not-an-options-hash", () => {
      expect(() => assertValidEnumOptions([])).not.toThrow();
    });
    it("treats Map / Date / class instances as not-an-options-hash", () => {
      expect(() => assertValidEnumOptions(new Map())).not.toThrow();
      expect(() => assertValidEnumOptions(new Date())).not.toThrow();
      class Foo {}
      expect(() => assertValidEnumOptions(new Foo())).not.toThrow();
    });
  });

  describe("detectNegativeEnumConditionsBang", () => {
    it("warns when notDraft conflicts with draft (camelCase prefix)", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      detectNegativeEnumConditionsBang(["draft", "notDraft"]);
      expect(spy).toHaveBeenCalledWith(
        expect.stringMatching(/conflicts with auto-generated negative scope 'notDraft'/),
      );
    });
    it("warns when not_draft conflicts with draft (snake_case prefix)", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      detectNegativeEnumConditionsBang(["draft", "not_draft"]);
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/'not_draft'/));
    });
    it("routes warnings through setEnumWarn instead of console.warn", () => {
      const calls: string[] = [];
      setEnumWarn((msg) => calls.push(msg));
      try {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        detectNegativeEnumConditionsBang(["draft", "notDraft"]);
        expect(calls.length).toBe(1);
        expect(consoleSpy).not.toHaveBeenCalled();
      } finally {
        setEnumWarn((msg) => console.warn(msg));
      }
    });
    it("does not warn for unrelated identifiers starting with 'not' (notebook, notify)", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      detectNegativeEnumConditionsBang(["ebook", "notebook", "ify", "notify"]);
      expect(spy).not.toHaveBeenCalled();
    });
    it("does not warn when there is no positive-form clash", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      detectNegativeEnumConditionsBang(["notDraft", "published"]);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
