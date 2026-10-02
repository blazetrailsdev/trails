import { beforeEach, describe, expect, it } from "vitest";
import { assertNothingRaised, assertPredicate, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, NoMethodError, rbFSend } from "@blazetrails/ruby-compat";
import { Option, type OptionOptions } from "./option.js";

describe("Thor::Option", () => {
  function parse(key: string | string[], value: unknown): Option {
    return Option.parse(key, value);
  }

  let memo: Option | undefined;
  beforeEach(() => {
    memo = undefined;
  });
  function option(name: string, options: OptionOptions = {}): Option {
    return (memo ??= new Option(name, options));
  }

  describe("#parse", () => {
    describe("with value as a symbol", () => {
      describe("and symbol is a valid type", () => {
        it("has type equals to the symbol", () => {
          expect(parse("foo", ":string").type).toEqual("string");
          expect(parse("foo", ":numeric").type).toEqual("numeric");
        });

        it("has no default value", () => {
          expect(parse("foo", ":string").default).toBeNull();
          expect(parse("foo", ":numeric").default).toBeNull();
        });
      });

      describe("equals to :required", () => {
        it("has type equals to :string", () => {
          expect(parse("foo", ":required").type).toEqual("string");
        });

        it("has no default value", () => {
          expect(parse("foo", ":required").default).toBeNull();
        });
      });

      describe("and symbol is not a reserved key", () => {
        it("has type equal to :string", () => {
          expect(parse("foo", ":bar").type).toEqual("string");
        });

        it("has no default value", () => {
          expect(parse("foo", ":bar").default).toBeNull();
        });
      });
    });

    describe("with value as hash", () => {
      it("has default type :hash", () => {
        expect(parse("foo", { a: ":b" }).type).toEqual("hash");
      });

      it("has default value equal to the hash", () => {
        expect(parse("foo", { a: ":b" }).default).toEqual({ a: ":b" });
      });
    });

    describe("with value as array", () => {
      it("has default type :array", () => {
        expect(parse("foo", [":a", ":b"]).type).toEqual("array");
      });

      it("has default value equal to the array", () => {
        expect(parse("foo", [":a", ":b"]).default).toEqual([":a", ":b"]);
      });
    });

    describe("with value as string", () => {
      it("has default type :string", () => {
        expect(parse("foo", "bar").type).toEqual("string");
      });

      it("has default value equal to the string", () => {
        expect(parse("foo", "bar").default).toEqual("bar");
      });
    });

    describe("with value as numeric", () => {
      it("has default type :numeric", () => {
        expect(parse("foo", 2.0).type).toEqual("numeric");
      });

      it("has default value equal to the numeric", () => {
        expect(parse("foo", 2.0).default).toEqual(2.0);
      });
    });

    describe("with value as boolean", () => {
      it("has default type :boolean", () => {
        expect(parse("foo", true).type).toEqual("boolean");
        expect(parse("foo", false).type).toEqual("boolean");
      });

      it("has default value equal to the boolean", () => {
        expect(parse("foo", true).default).toEqual(true);
        expect(parse("foo", false).default).toEqual(false);
      });
    });

    describe("with key as a symbol", () => {
      it("sets the name equal to the key", () => {
        expect(parse("foo", true).name).toEqual("foo");
      });
    });

    describe("with key as an array", () => {
      it("sets the first items in the array to the name", () => {
        expect(parse(["foo", "b", "--bar"], true).name).toEqual("foo");
      });

      it("sets all other items as normalized aliases", () => {
        expect(parse(["foo", "b", "--bar"], true).aliases).toEqual(["-b", "--bar"]);
      });
    });
  });

  it("returns the switch name", () => {
    expect(option("foo").switchName).toEqual("--foo");
    expect(option("--foo").switchName).toEqual("--foo");
  });

  it("returns the human name", () => {
    expect(option("foo").humanName).toEqual("foo");
    expect(option("--foo").humanName).toEqual("foo");
  });

  it("converts underscores to dashes", () => {
    expect(option("foo_bar").switchName).toEqual("--foo-bar");
  });

  it("can be required and have default values", () => {
    const o = option("foo", { required: true, type: "string", default: "bar" });
    expect(o.default).toEqual("bar");
    assertPredicate(o, (opt) => opt.isRequired());
  });

  it("raises an error if default is inconsistent with type and check_default_type is true", async () => {
    await assertRaises(
      [ArgumentError],
      { match: /^Expected numeric default value for '--foo-bar'; got "baz" \(string\)$/ },
      () => {
        option("foo_bar", { type: "numeric", default: "baz", checkDefaultType: true });
      },
    );
  });

  it("raises an error if repeatable and default is inconsistent with type and check_default_type is true", async () => {
    await assertRaises(
      [ArgumentError],
      { match: /^Expected array default value for '--foo-bar'; got "baz" \(string\)$/ },
      () => {
        option("foo_bar", {
          type: "numeric",
          repeatable: true,
          default: "baz",
          checkDefaultType: true,
        });
      },
    );
  });

  it("raises an error type hash is repeatable and default is inconsistent with type and check_default_type is true", async () => {
    await assertRaises(
      [ArgumentError],
      { match: /^Expected hash default value for '--foo-bar'; got "baz" \(string\)$/ },
      () => {
        option("foo_bar", {
          type: "hash",
          repeatable: true,
          default: "baz",
          checkDefaultType: true,
        });
      },
    );
  });

  it("does not raises an error if type hash is repeatable and default is consistent with type and check_default_type is true", async () => {
    await assertNothingRaised(() => {
      option("foo_bar", { type: "hash", repeatable: true, default: {}, checkDefaultType: true });
    });
  });

  it("does not raises an error if repeatable and default is consistent with type and check_default_type is true", async () => {
    await assertNothingRaised(() => {
      option("foo_bar", {
        type: "numeric",
        repeatable: true,
        default: [1],
        checkDefaultType: true,
      });
    });
  });

  it("does not raises an error if default is an symbol and type string and check_default_type is true", async () => {
    await assertNothingRaised(() => {
      option("foo", { type: "string", default: ":bar", checkDefaultType: true });
    });
  });

  it("does not raises an error if default is inconsistent with type and check_default_type is false", async () => {
    await assertNothingRaised(() => {
      option("foo_bar", { type: "numeric", default: "baz", checkDefaultType: false });
    });
  });

  it("boolean options cannot be required", async () => {
    await assertRaises(
      [ArgumentError],
      { match: /^An option cannot be boolean and required\.$/ },
      () => {
        option("foo", { required: true, type: "boolean" });
      },
    );
  });

  it("does not raises an error if default is a boolean and it is required", async () => {
    await assertNothingRaised(() => {
      option("foo", { required: true, default: true });
    });
  });

  it("allows type predicates", () => {
    assertPredicate(parse("foo", ":string"), (o) => o.isString());
    assertPredicate(parse("foo", ":boolean"), (o) => o.isBoolean());
    assertPredicate(parse("foo", ":numeric"), (o) => o.isNumeric());
  });

  it("raises an error on method missing", async () => {
    await assertRaises([NoMethodError], {}, () => {
      rbFSend(parse("foo", ":string"), "isUnknown");
    });
  });

  describe("#usage", () => {
    it("returns usage for string types", () => {
      expect(parse("foo", ":string").usage()).toEqual("[--foo=FOO]");
    });

    it("returns usage for numeric types", () => {
      expect(parse("foo", ":numeric").usage()).toEqual("[--foo=N]");
    });

    it("returns usage for array types", () => {
      expect(parse("foo", ":array").usage()).toEqual("[--foo=one two three]");
    });

    it("returns usage for hash types", () => {
      expect(parse("foo", ":hash").usage()).toEqual("[--foo=key:value]");
    });

    it("returns usage for boolean types", () => {
      expect(parse("foo", ":boolean").usage()).toEqual("[--foo], [--no-foo], [--skip-foo]");
    });

    it("does not use padding when no aliases are given", () => {
      expect(parse("foo", ":boolean").usage()).toEqual("[--foo], [--no-foo], [--skip-foo]");
    });

    it("documents a negative option when boolean", () => {
      expect(parse("foo", ":boolean").usage()).toContain("[--no-foo]");
    });

    it("does not document a negative option for a negative boolean", () => {
      expect(parse("no-foo", ":boolean").usage()).not.toContain("[--no-no-foo]");
      expect(parse("no-foo", ":boolean").usage()).not.toContain("[--skip-no-foo]");
      expect(parse("skip-foo", ":boolean").usage()).not.toContain("[--no-skip-foo]");
      expect(parse("skip-foo", ":boolean").usage()).not.toContain("[--skip-skip-foo]");
    });

    it("does not document a negative option for an underscored negative boolean", () => {
      expect(parse("noFoo", ":boolean").usage()).not.toContain("[--no-no-foo]");
    });

    it("documents a negative option for a positive boolean starting with 'no'", () => {
      expect(parse("nougat", ":boolean").usage()).toContain("[--no-nougat]");
    });

    it("uses banner when supplied", () => {
      expect(option("foo", { required: false, type: "string", banner: "BAR" }).usage()).toEqual(
        "[--foo=BAR]",
      );
    });

    it("checks when banner is an empty string", () => {
      expect(option("foo", { required: false, type: "string", banner: "" }).usage()).toEqual(
        "[--foo]",
      );
    });

    describe("with required values", () => {
      it("does not show the usage between brackets", () => {
        expect(parse("foo", ":required").usage()).toEqual("--foo=FOO");
      });
    });

    describe("with aliases", () => {
      it("does not show the usage between brackets", () => {
        expect(parse(["foo", "-f", "-b"], ":required").usage()).toEqual("-f, -b, --foo=FOO");
      });

      it("does not negate the aliases", () => {
        expect(parse(["foo", "-f", "-b"], ":boolean").usage()).toEqual(
          "-f, -b, [--foo], [--no-foo], [--skip-foo]",
        );
      });

      it("normalizes the aliases", () => {
        expect(parse(["foo", "f", "-b"], ":required").usage()).toEqual("-f, -b, --foo=FOO");
      });
    });
  });

  describe("#print_default", () => {
    it("prints boolean with true default value", () => {
      expect(
        option("foo", {
          required: false,
          type: "boolean",
          default: true,
        }).printDefault(),
      ).toEqual(true);
    });
    it("prints boolean with false default value", () => {
      expect(
        option("foo", {
          required: false,
          type: "boolean",
          default: false,
        }).printDefault(),
      ).toEqual(false);
    });
  });
});
