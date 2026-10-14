import { describe, expect, it } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Argument, type ArgumentOptions } from "./argument.js";

describe("Thor::Argument", () => {
  function argument(name: string | null, options: ArgumentOptions = {}): Argument {
    return new Argument(name, options);
  }

  describe("errors", () => {
    it("raises an error if name is not supplied", async () => {
      await assertRaises([ArgumentError], { match: /^Argument name can't be nil\.$/ }, () => {
        argument(null);
      });
    });

    it("raises an error if type is unknown", async () => {
      await assertRaises(
        [ArgumentError],
        { match: /^Type :unknown is not valid for arguments\.$/ },
        () => {
          argument("command", { type: "unknown" });
        },
      );
    });

    it("raises an error if argument is required and has default values", async () => {
      await assertRaises(
        [ArgumentError],
        { match: /^An argument cannot be required and have default value\.$/ },
        () => {
          argument("command", { type: "string", default: "bar", required: true });
        },
      );
    });

    it("raises an error if enum isn't enumerable", async () => {
      await assertRaises(
        [ArgumentError],
        { match: /^An argument cannot have an enum other than an enumerable\.$/ },
        () => {
          argument("command", { type: "string", enum: "bar" });
        },
      );
    });
  });

  describe("#usage", () => {
    it("returns usage for string types", () => {
      expect(argument("foo", { type: "string" }).usage()).toEqual("FOO");
    });

    it("returns usage for numeric types", () => {
      expect(argument("foo", { type: "numeric" }).usage()).toEqual("N");
    });

    it("returns usage for array types", () => {
      expect(argument("foo", { type: "array" }).usage()).toEqual("one two three");
    });

    it("returns usage for hash types", () => {
      expect(argument("foo", { type: "hash" }).usage()).toEqual("key:value");
    });
  });

  describe("#print_default", () => {
    it("prints arrays in a copy pasteable way", () => {
      expect(
        argument("foo", {
          required: false,
          type: "array",
          default: ["one", "two"],
        }).printDefault(),
      ).toEqual('"one" "two"');
    });
    it("prints arrays with a single string default as before", () => {
      expect(
        argument("foo", {
          required: false,
          type: "array",
          default: "foobar",
        }).printDefault(),
      ).toEqual("foobar");
    });
    it("prints none arrays as default", () => {
      expect(
        argument("foo", {
          required: false,
          type: "numeric",
          default: 13,
        }).printDefault(),
      ).toEqual(13);
    });
  });
});
