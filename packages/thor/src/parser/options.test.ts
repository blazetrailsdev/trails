import { beforeEach, describe, expect, it } from "vitest";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
import { Range, rbObjIvarGet } from "@blazetrails/ruby-compat";
import {
  AtLeastOneRequiredArgumentError,
  Correctable,
  ExclusiveArgumentError,
  MalformattedArgumentError,
  RequiredArgumentMissingError,
  UnknownArgumentError,
} from "../error.js";
import { Option } from "./option.js";
import { Options } from "./options.js";

describe("Thor::Options", () => {
  let opt: Options;

  function create(
    opts: Record<string, unknown> | Map<string | string[], unknown>,
    defaults: Record<string, unknown> = {},
    stopOnUnknown = false,
    exclusives: string[][] = [],
    atLeastOnes: string[][] = [],
  ): Options {
    const relation = {
      exclusiveOptionNames: exclusives,
      atLeastOneOptionNames: atLeastOnes,
    };
    const hashOptions: Record<string, Option> = {};
    (opts instanceof Map ? [...opts] : Object.entries(opts)).forEach(([key, value]) => {
      hashOptions[String(key)] = value instanceof Option ? value : Option.parse(key, value);
    });
    return (opt = new Options(hashOptions, defaults, stopOnUnknown, false, relation));
  }

  function parse(...args: unknown[]) {
    return opt.parse(args.flat());
  }

  function checkUnknownBang(): void {
    opt.checkUnknownBang();
  }

  function remaining(): unknown[] {
    return opt.remaining();
  }

  describe("#to_switches", () => {
    it("turns true values into a flag", () => {
      expect(Options.toSwitches({ color: true })).toEqual("--color");
    });

    it("ignores nil", () => {
      expect(Options.toSwitches({ color: null })).toEqual("");
    });

    it("ignores false", () => {
      expect(Options.toSwitches({ color: false })).toEqual("");
    });

    it("avoids extra spaces", () => {
      expect(Options.toSwitches({ color: false, foo: null })).toEqual("");
    });

    it("writes --name value for anything else", () => {
      expect(Options.toSwitches({ format: "specdoc" })).toEqual('--format "specdoc"');
    });

    it("joins several values", () => {
      const switches = Options.toSwitches({ color: true, foo: "bar" }).split(" ").sort();
      expect(switches).toEqual(['"bar"', "--color", "--foo"]);
    });

    it("accepts arrays", () => {
      expect(Options.toSwitches({ count: [1, 2, 3] })).toEqual("--count 1 2 3");
    });

    it("accepts hashes", () => {
      expect(Options.toSwitches({ count: { a: "b" } })).toEqual("--count a:b");
    });

    it("accepts underscored options", () => {
      expect(Options.toSwitches({ under_score_option: "foo bar" })).toEqual(
        '--under_score_option "foo bar"',
      );
    });
  });

  describe("#parse", () => {
    it("allows multiple aliases for a given switch", () => {
      create(new Map([[["--foo", "--bar", "--baz"], ":string"]]));
      expect(parse("--foo", "12")["foo"]).toEqual("12");
      expect(parse("--bar", "12")["foo"]).toEqual("12");
      expect(parse("--baz", "12")["foo"]).toEqual("12");
    });

    it("allows custom short names", () => {
      create({ "-f": ":string" });
      expect(Object.fromEntries(parse("-f", "12"))).toEqual({ f: "12" });
    });

    it("allows custom short-name aliases", () => {
      create(new Map([[["--bar", "-f"], ":string"]]));
      expect(Object.fromEntries(parse("-f", "12"))).toEqual({ bar: "12" });
    });

    it("accepts conjoined short switches", () => {
      create(
        new Map([
          [["--foo", "-f"], true],
          [["--bar", "-b"], true],
          [["--app", "-a"], true],
        ]),
      );
      const opts = parse("-fba");
      expect(opts["foo"]).toBe(true);
      expect(opts["bar"]).toBe(true);
      expect(opts["app"]).toBe(true);
    });

    it("accepts conjoined short switches with input", () => {
      create(
        new Map<string[], unknown>([
          [["--foo", "-f"], true],
          [["--bar", "-b"], true],
          [["--app", "-a"], ":required"],
        ]),
      );
      const opts = parse("-fba", "12");
      expect(opts["foo"]).toBe(true);
      expect(opts["bar"]).toBe(true);
      expect(opts["app"]).toEqual("12");
    });

    it("returns the default value if none is provided", () => {
      create({ foo: "baz", bar: ":required" });
      expect(parse("--bar", "boom")["foo"]).toEqual("baz");
    });

    it("returns the default value from defaults hash to required arguments", () => {
      create({ bar: ":required" }, { bar: "baz" });
      expect(parse()["bar"]).toEqual("baz");
    });

    it("gives higher priority to defaults given in the hash", () => {
      create({ bar: true }, { bar: false });
      expect(parse()["bar"]).toEqual(false);
    });

    it("raises an error for unknown switches", async () => {
      create({ foo: "baz", bar: ":required" });
      parse("--bar", "baz", "--baz", "unknown");

      const expected = 'Unknown switches "--baz"' + (Correctable ? '\nDid you mean?  "--bar"' : "");

      const error = await assertRaises([UnknownArgumentError], {}, () => checkUnknownBang());
      expect(error.toString()).toEqual(expected);
    });

    it("skips leading non-switches", () => {
      create({ foo: "baz" });

      expect(Object.fromEntries(parse("asdf", "--foo", "bar"))).toEqual({ foo: "bar" });
    });

    it("correctly recognizes things that look kind of like options, but aren't, as not options", () => {
      create({ foo: "baz" });
      expect(
        Object.fromEntries(parse("--asdf---asdf", "baz", "--foo", "--asdf---dsf--asdf")),
      ).toEqual({ foo: "--asdf---dsf--asdf" });
      checkUnknownBang();
    });

    it("accepts underscores in commandline args hash for boolean", () => {
      create({ foo_bar: ":boolean" });
      expect(parse("--foo_bar")["foo_bar"]).toEqual(true);
      expect(parse("--no_foo_bar")["foo_bar"]).toEqual(false);
    });

    it("accepts underscores in commandline args hash for strings", () => {
      create({ foo_bar: ":string", baz_foo: ":string" });
      expect(parse("--foo_bar", "baz")["foo_bar"]).toEqual("baz");
      expect(parse("--baz_foo", "foo bar")["baz_foo"]).toEqual("foo bar");
    });

    it("interprets everything after -- as args instead of options", () => {
      create({ foo: ":string", bar: ":required" });
      expect(
        Object.fromEntries(parse(["--bar", "abc", "moo", "--", "--foo", "def", "-a"])),
      ).toEqual({ bar: "abc" });
      expect(remaining()).toEqual(["moo", "--foo", "def", "-a"]);
    });

    it("ignores -- when looking for single option values", () => {
      create({ foo: ":string", bar: ":required" });
      expect(Object.fromEntries(parse(["--bar", "--", "--foo", "def", "-a"]))).toEqual({
        bar: "--foo",
      });
      expect(remaining()).toEqual(["def", "-a"]);
    });

    it("ignores -- when looking for array option values", () => {
      create({ foo: ":array" });
      expect(Object.fromEntries(parse(["--foo", "a", "b", "--", "c", "d", "-e"]))).toEqual({
        foo: ["a", "b", "c", "d", "-e"],
      });
      expect(remaining()).toEqual([]);
    });

    it("ignores -- when looking for hash option values", () => {
      create({ foo: ":hash" });
      expect(Object.fromEntries(parse(["--foo", "a:b", "--", "c:d", "-e"]))).toEqual({
        foo: { a: "b", c: "d" },
      });
      expect(remaining()).toEqual(["-e"]);
    });

    it("ignores trailing --", () => {
      create({ foo: ":string" });
      expect(Object.fromEntries(parse(["--foo", "--"]))).toEqual({ foo: null });
      expect(remaining()).toEqual([]);
    });

    describe("with no input", () => {
      it("and no switches returns an empty hash", () => {
        create({});
        expect(Object.fromEntries(parse())).toEqual({});
      });

      it("and several switches returns an empty hash", () => {
        create({ "--foo": ":boolean", "--bar": ":string" });
        expect(Object.fromEntries(parse())).toEqual({});
      });

      it("and a required switch raises an error", async () => {
        create({ "--foo": ":required" });
        await assertRaises(
          [RequiredArgumentMissingError],
          { match: /^No value provided for required options '--foo'$/ },
          () => parse(),
        );
      });
    });

    describe("with one required and one optional switch", () => {
      beforeEach(() => {
        create({ "--foo": ":required", "--bar": ":boolean" });
      });

      it("raises an error if the required switch has no argument", async () => {
        await assertRaises([MalformattedArgumentError], {}, () => parse("--foo"));
      });

      it("raises an error if the required switch isn't given", async () => {
        await assertRaises([RequiredArgumentMissingError], {}, () => parse("--bar"));
      });

      it("raises an error if the required switch is set to nil", async () => {
        await assertRaises([RequiredArgumentMissingError], {}, () => parse("--no-foo"));
      });

      it("does not raises an error if the required option has a default value", async () => {
        const options = { required: true, type: "string", default: "baz" };
        create({ foo: new Option("foo", options), bar: ":boolean" });
        await assertNothingRaised(() => parse("--bar"));
      });
    });

    describe("when stop_on_unknown is true", () => {
      beforeEach(() => {
        create({ foo: ":string", verbose: ":boolean" }, {}, true);
      });

      it("stops parsing on first non-option", () => {
        expect(Object.fromEntries(parse(["foo", "--verbose"]))).toEqual({});
        expect(remaining()).toEqual(["foo", "--verbose"]);
      });

      it("stops parsing on unknown option", () => {
        expect(Object.fromEntries(parse(["--bar", "--verbose"]))).toEqual({});
        expect(remaining()).toEqual(["--bar", "--verbose"]);
      });

      it("retains -- after it has stopped parsing", () => {
        expect(Object.fromEntries(parse(["--bar", "--", "whatever"]))).toEqual({});
        expect(remaining()).toEqual(["--bar", "--", "whatever"]);
      });

      it("still accepts options that are given before non-options", () => {
        expect(Object.fromEntries(parse(["--verbose", "foo"]))).toEqual({ verbose: true });
        expect(remaining()).toEqual(["foo"]);
      });

      it("still accepts options that require a value", () => {
        expect(Object.fromEntries(parse(["--foo", "bar", "baz"]))).toEqual({ foo: "bar" });
        expect(remaining()).toEqual(["baz"]);
      });

      it("still interprets everything after -- as args instead of options", () => {
        expect(Object.fromEntries(parse(["--", "--verbose"]))).toEqual({});
        expect(remaining()).toEqual(["--verbose"]);
      });
    });

    describe("when exclusives is given", () => {
      beforeEach(() => {
        create({ foo: ":boolean", bar: ":boolean", baz: ":boolean", qux: ":boolean" }, {}, false, [
          ["foo", "bar"],
          ["baz", "qux"],
        ]);
      });

      it("raises an error if exclusive argumets are given", async () => {
        await assertRaises(
          [ExclusiveArgumentError],
          { match: /^Found exclusive options '--foo', '--bar'$/ },
          () => parse(["--foo", "--bar"]),
        );
      });

      it("does not raise an error if exclusive argumets are not given", async () => {
        await assertNothingRaised(() => parse(["--foo", "--baz"]));
      });
    });

    describe("when at_least_ones is given", () => {
      beforeEach(() => {
        create(
          { foo: ":string", bar: ":boolean", baz: ":boolean", qux: ":boolean" },
          {},
          false,
          [],
          [
            ["foo", "bar"],
            ["baz", "qux"],
          ],
        );
      });

      it("raises an error if at least one of required argumet is not given", async () => {
        await assertRaises(
          [AtLeastOneRequiredArgumentError],
          { match: /^Not found at least one of required options '--foo', '--bar'$/ },
          () => parse(["--baz"]),
        );
      });

      it("does not raise an error if at least one of required argument is given", async () => {
        await assertNothingRaised(() => parse(["--foo", "--baz"]));
      });
    });

    describe("when exclusives is given", () => {
      beforeEach(() => {
        create({ foo: ":boolean", bar: ":boolean", baz: ":boolean", qux: ":boolean" }, {}, false, [
          ["foo", "bar"],
          ["baz", "qux"],
        ]);
      });

      it("raises an error if exclusive argumets are given", async () => {
        await assertRaises(
          [ExclusiveArgumentError],
          { match: /^Found exclusive options '--foo', '--bar'$/ },
          () => parse(["--foo", "--bar"]),
        );
      });

      it("does not raise an error if exclusive argumets are not given", async () => {
        await assertNothingRaised(() => parse(["--foo", "--baz"]));
      });
    });

    describe("when at_least_ones is given", () => {
      beforeEach(() => {
        create(
          { foo: ":string", bar: ":boolean", baz: ":boolean", qux: ":boolean" },
          {},
          false,
          [],
          [
            ["foo", "bar"],
            ["baz", "qux"],
          ],
        );
      });

      it("raises an error if at least one of required argumet is not given", async () => {
        await assertRaises(
          [AtLeastOneRequiredArgumentError],
          { match: /^Not found at least one of required options '--foo', '--bar'$/ },
          () => parse(["--baz"]),
        );
      });

      it("does not raise an error if at least one of required argument is given", async () => {
        await assertNothingRaised(() => parse(["--foo", "--baz"]));
      });
    });

    describe("with :string type", () => {
      beforeEach(() => {
        create(new Map([[["--foo", "-f"], ":required"]]));
      });

      it("accepts a switch <value> assignment", () => {
        expect(parse("--foo", "12")["foo"]).toEqual("12");
      });

      it("accepts a switch=<value> assignment", () => {
        expect(parse("-f=12")["foo"]).toEqual("12");
        expect(parse("--foo=12")["foo"]).toEqual("12");
        expect(parse("--foo=bar=baz")["foo"]).toEqual("bar=baz");
        expect(parse("--foo=-bar")["foo"]).toEqual("-bar");
        expect(parse("--foo=-bar -baz")["foo"]).toEqual("-bar -baz");
      });

      it("must accept underscores switch=value assignment", () => {
        create({ foo_bar: ":required" });
        expect(parse("--foo_bar=http://example.com/under_score/")["foo_bar"]).toEqual(
          "http://example.com/under_score/",
        );
      });

      it("accepts a --no-switch format", () => {
        create({ "--foo": "bar" });
        expect(parse("--no-foo")["foo"]).toBeNull();
      });

      it("does not consume an argument for --no-switch format", () => {
        create({ "--cheese": ":string" });
        expect(parse("burger", "--no-cheese", "fries")["cheese"]).toBeNull();
      });

      it("accepts a --switch format on non required types", () => {
        create({ "--foo": ":string" });
        expect(parse("--foo")["foo"]).toEqual("foo");
      });

      it("accepts a --switch format on non required types with default values", () => {
        create({ "--baz": ":string", "--foo": "bar" });
        expect(parse("--baz", "bang", "--foo")["foo"]).toEqual("bar");
      });

      it("overwrites earlier values with later values", () => {
        expect(parse("--foo=bar", "--foo", "12")["foo"]).toEqual("12");
        expect(parse("--foo", "12", "--foo", "13")["foo"]).toEqual("13");
      });

      it("raises error when value isn't in enum", async () => {
        const enum_ = ["apple", "banana"];
        create({ fruit: new Option("fruit", { type: "string", enum: enum_ }) });
        await assertRaises(
          [MalformattedArgumentError],
          {
            match: new RegExp(`^Expected '--fruit' to be one of ${enum_.join(", ")}; got orange$`),
          },
          () => parse("--fruit", "orange"),
        );
      });

      it("does not erroneously mutate defaults", () => {
        create({
          foo: new Option("foo", {
            type: "string",
            repeatable: true,
            required: false,
            default: [],
          }),
        });
        expect(parse("--foo=bar", "--foo", "12")["foo"]).toEqual(["bar", "12"]);
        expect((rbObjIvarGet(opt, "@switches") as Record<string, Option>)["--foo"].default).toEqual(
          [],
        );
      });
    });

    describe("with :boolean type", () => {
      beforeEach(() => {
        create({ "--foo": false });
      });

      it("accepts --opt assignment", () => {
        expect(parse("--foo")["foo"]).toEqual(true);
        expect(parse("--foo", "--bar")["foo"]).toEqual(true);
      });

      it("uses the default value if no switch is given", () => {
        expect(parse("")["foo"]).toEqual(false);
      });

      it("accepts --opt=value assignment", () => {
        expect(parse("--foo=true")["foo"]).toEqual(true);
        expect(parse("--foo=false")["foo"]).toEqual(false);
      });

      it("accepts --[no-]opt variant, setting false for value", () => {
        expect(parse("--no-foo")["foo"]).toEqual(false);
      });

      it("accepts --[skip-]opt variant, setting false for value", () => {
        expect(parse("--skip-foo")["foo"]).toEqual(false);
      });

      it("accepts --[skip-]opt variant, setting false for value, even if there's a trailing non-switch", () => {
        expect(parse("--skip-foo", "asdf")["foo"]).toEqual(false);
      });

      it("will prefer 'no-opt' variant over inverting 'opt' if explicitly set", () => {
        create({ "--no-foo": true });
        expect(parse("--no-foo")["no-foo"]).toEqual(true);
      });

      it("will prefer 'skip-opt' variant over inverting 'opt' if explicitly set", () => {
        create({ "--skip-foo": true });
        expect(parse("--skip-foo")["skip-foo"]).toEqual(true);
      });

      it("will prefer 'skip-opt' variant over inverting 'opt' if explicitly set, even if there's a trailing non-switch", () => {
        create({ "--skip-foo": true });
        expect(parse("--skip-foo", "asdf")["skip-foo"]).toEqual(true);
      });

      it("will prefer 'skip-opt' variant over inverting 'opt' if explicitly set, and given a value", () => {
        create({ "--skip-foo": true });
        expect(parse("--skip-foo=f")["skip-foo"]).toEqual(false);
        expect(parse("--skip-foo=false")["skip-foo"]).toEqual(false);
        expect(parse("--skip-foo=t")["skip-foo"]).toEqual(true);
        expect(parse("--skip-foo=true")["skip-foo"]).toEqual(true);
      });

      it("accepts inputs in the human name format", () => {
        create({ foo_bar: ":boolean" });
        expect(parse("--foo-bar")["foo_bar"]).toEqual(true);
        expect(parse("--no-foo-bar")["foo_bar"]).toEqual(false);
        expect(parse("--skip-foo-bar")["foo_bar"]).toEqual(false);
      });

      it("doesn't eat the next part of the param", () => {
        expect(Object.fromEntries(parse("--foo", "bar"))).toEqual({ foo: true });
        expect(opt.remaining()).toEqual(["bar"]);
      });

      it("doesn't eat the next part of the param with 'no-opt' variant", () => {
        expect(Object.fromEntries(parse("--no-foo", "bar"))).toEqual({ foo: false });
        expect(opt.remaining()).toEqual(["bar"]);
      });

      it("doesn't eat the next part of the param with 'skip-opt' variant", () => {
        expect(Object.fromEntries(parse("--skip-foo", "bar"))).toEqual({ foo: false });
        expect(opt.remaining()).toEqual(["bar"]);
      });

      it("allows multiple values if repeatable is specified", () => {
        create({
          verbose: new Option("verbose", { type: "boolean", aliases: "-v", repeatable: true }),
        });
        expect((parse("-v", "-v", "-v")["verbose"] as unknown[]).length).toEqual(3);
      });
    });

    describe("with :hash type", () => {
      beforeEach(() => {
        create({ "--attributes": ":hash" });
      });

      it("accepts a switch=<value> assignment", () => {
        expect(parse("--attributes=name:string", "age:integer")["attributes"]).toEqual({
          name: "string",
          age: "integer",
        });
        expect(
          parse("--attributes=-name:string", "age:integer", "--gender:string")["attributes"],
        ).toEqual({ "-name": "string", age: "integer" });
      });

      it("accepts a switch <value> assignment", () => {
        expect(parse("--attributes", "name:string", "age:integer")["attributes"]).toEqual({
          name: "string",
          age: "integer",
        });
      });

      it("must not mix values with other switches", () => {
        expect(
          parse("--attributes", "name:string", "age:integer", "--baz", "cool")["attributes"],
        ).toEqual({ name: "string", age: "integer" });
      });

      it("must not allow the same hash key to be specified multiple times", async () => {
        await assertRaises(
          [MalformattedArgumentError],
          {
            match:
              /^You can't specify 'name' more than once in option '--attributes'; got name:string and name:integer$/,
          },
          () => parse("--attributes", "name:string", "name:integer"),
        );
      });

      it("allows multiple values if repeatable is specified", () => {
        create({ attributes: new Option("attributes", { type: "hash", repeatable: true }) });
        expect(
          parse("--attributes", "name:one", "foo:1", "--attributes", "name:two", "bar:2")[
            "attributes"
          ],
        ).toEqual({ name: "two", foo: "1", bar: "2" });
      });
    });

    describe("with :array type", () => {
      beforeEach(() => {
        create({ "--attributes": ":array" });
      });

      it("accepts a switch=<value> assignment", () => {
        expect(parse("--attributes=a", "b", "c")["attributes"]).toEqual(["a", "b", "c"]);
        expect(parse("--attributes=-a", "b", "-c")["attributes"]).toEqual(["-a", "b"]);
      });

      it("accepts a switch <value> assignment", () => {
        expect(parse("--attributes", "a", "b", "c")["attributes"]).toEqual(["a", "b", "c"]);
      });

      it("must not mix values with other switches", () => {
        expect(parse("--attributes", "a", "b", "c", "--baz", "cool")["attributes"]).toEqual([
          "a",
          "b",
          "c",
        ]);
      });

      it("allows multiple values if repeatable is specified", () => {
        create({ attributes: new Option("attributes", { type: "array", repeatable: true }) });
        expect(parse("--attributes", "1", "2", "--attributes", "3", "4")["attributes"]).toEqual([
          ["1", "2"],
          ["3", "4"],
        ]);
      });

      it("raises error when value isn't in enum", async () => {
        const enum_ = ["apple", "banana"];
        create({ fruit: new Option("fruits", { type: "array", enum: enum_ }) });
        await assertRaises(
          [MalformattedArgumentError],
          {
            match: new RegExp(
              `^Expected all values of '--fruits' to be one of ${enum_.join(", ")}; got strawberry$`,
            ),
          },
          () => parse("--fruits=", "apple", "banana", "strawberry"),
        );
      });
    });

    describe("with :numeric type", () => {
      beforeEach(() => {
        create({ n: ":numeric", m: 5 });
      });

      it("accepts a -nXY assignment", () => {
        expect(parse("-n12")["n"]).toEqual(12);
      });

      it("converts values to numeric types", () => {
        expect(Object.fromEntries(parse("-n", "3", "-m", ".5"))).toEqual({ n: 3, m: 0.5 });
      });

      it("raises error when value isn't numeric", async () => {
        await assertRaises(
          [MalformattedArgumentError],
          { match: /^Expected numeric value for '-n'; got "foo"$/ },
          () => parse("-n", "foo"),
        );
      });

      it("raises error when value isn't in Array enum", async () => {
        const enum_ = [1, 2];
        create({ limit: new Option("limit", { type: "numeric", enum: enum_ }) });
        await assertRaises(
          [MalformattedArgumentError],
          { match: /^Expected '--limit' to be one of 1, 2; got 3$/ },
          () => parse("--limit", "3"),
        );
      });

      it("raises error when value isn't in Range enum", async () => {
        const enum_ = new Range(1, 2);
        create({ limit: new Option("limit", { type: "numeric", enum: enum_ }) });
        await assertRaises(
          [MalformattedArgumentError],
          { match: /^Expected '--limit' to be one of 1\.\.2; got 3$/ },
          () => parse("--limit", "3"),
        );
      });

      it("allows multiple values if repeatable is specified", () => {
        create({ run: new Option("run", { type: "numeric", repeatable: true }) });
        expect(parse("--run", "1", "--run", "2")["run"]).toEqual([1, 2]);
      });
    });
  });
});
