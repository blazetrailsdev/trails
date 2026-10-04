import { beforeEach, describe, expect, it } from "vitest";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport";
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
  });
});
