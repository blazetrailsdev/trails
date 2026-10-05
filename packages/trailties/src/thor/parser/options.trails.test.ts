import { describe, expect, it } from "vitest";
import { FrozenError, rbFSend, rbObjIvarSet } from "@blazetrails/ruby-compat";
import {
  AtLeastOneRequiredArgumentError,
  ExclusiveArgumentError,
  MalformattedArgumentError,
  UnknownArgumentError,
} from "../error.js";
import { Option } from "./option.js";
import { Options } from "./options.js";

function create(
  opts: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
  stopOnUnknown = false,
  relations: { exclusiveOptionNames?: string[][]; atLeastOneOptionNames?: string[][] } = {},
): Options {
  const hashOptions: Record<string, Option> = {};
  for (const [key, value] of Object.entries(opts)) {
    const name = key.split(",")[0];
    hashOptions[name] =
      value instanceof Option
        ? value
        : Option.parse(key.includes(",") ? key.split(",") : key, value);
  }
  return new Options(hashOptions, defaults, stopOnUnknown, false, relations);
}

const parse = (options: Options, ...args: unknown[]) => Object.fromEntries(options.parse(args));

describe("Thor::Options", () => {
  it("renders a hash as switches, inspecting Array and scalar values", () => {
    expect(
      Options.toSwitches({
        foo: "bar",
        on: true,
        off: false,
        none: null,
        count: 3,
        list: ["a", 1],
        map: { a: "b", c: 1 },
      }),
    ).toBe('--foo "bar" --on --count 3 --list "a" 1 --map a:b c:1');
  });

  it("reads each switch shape through the match of its own regex", () => {
    const options = create({ "foo,-f": ":string", "num,-n": ":numeric", bar_baz: ":string" });
    expect(parse(options, "--foo=a", "-n3", "--bar_baz", "c")).toEqual({
      foo: "a",
      num: 3,
      bar_baz: "c",
    });
    expect(parse(create({ "foo,-f": ":string" }), "-f=a=b")).toEqual({ foo: "a=b" });
  });

  it("treats only a newline as a line break in a switch", () => {
    const options = create({ foo: ":string" });
    expect(parse(options, "--foo=a\rb\u2028c")).toEqual({ foo: "a\rb\u2028c" });
    expect(parse(options, "a\n--foo=b\nc")).toEqual({ foo: "b" });

    const unknown = create({ foo: ":string" });
    unknown.parse(["--foo\rbar", "--bar\rbaz--qux", "--baz\u2028"]);
    expect(unknown.remaining()).toEqual(["--foo\rbar", "--bar\rbaz--qux", "--baz\u2028"]);
    let error: UnknownArgumentError | undefined;
    try {
      unknown.checkUnknownBang();
    } catch (e) {
      error = e as UnknownArgumentError;
    }
    expect(error!.unknown).toEqual(["--foo\rbar", "--baz\u2028"]);
  });

  it("drops the sign from a numeric glued to a short switch", () => {
    expect(parse(create({ "num,-n": ":numeric" }), "-n-5")).toEqual({ num: 5 });
  });

  it("splits clustered short switches into one switch each", () => {
    const options = create({ "a,-a": ":boolean", "b,-b": ":boolean", "c,-c": ":string" });
    expect(parse(options, "-abc", "x")).toEqual({ a: true, b: true, c: "x" });
  });

  it("does not re-read a value given with = as a switch", () => {
    const options = create({ "foo,-f": ":string", "x,-x": ":boolean" });
    expect(parse(options, "--foo=-x")).toEqual({ foo: "-x" });
    expect(parse(options, "--foo=--", "-x")).toEqual({ foo: "-x" });
    expect(options.remaining()).toEqual([]);
  });

  it("stops parsing switches at --", () => {
    const options = create({ foo: ":boolean" });
    expect(parse(options, "--foo", "--", "--foo", "--bar")).toEqual({ foo: true });
    expect(options.remaining()).toEqual(["--foo", "--bar"]);
    expect(() => options.checkUnknownBang()).not.toThrow();
  });

  it("checks only the extras before the stop index, an index of 0 included", () => {
    const options = create({ foo: ":boolean" });
    options.parse(["--", "--bar"]);
    expect(options.remaining()).toEqual(["--bar"]);
    expect(() => options.checkUnknownBang()).not.toThrow();

    const stopped = create({ foo: ":boolean" });
    stopped.parse(["--bar", "--", "--baz"]);
    expect(() => stopped.checkUnknownBang()).toThrow(
      new UnknownArgumentError(["--foo"], ["--bar"]),
    );
  });

  it("names an unknown switch but not an extra holding a later --", () => {
    const options = create({ foo: ":boolean" });
    options.parse(["--bar", "-z", "a--b", "--x--y", "plain"]);
    expect(options.remaining()).toEqual(["--bar", "-z", "a--b", "--x--y", "plain"]);
    let error: UnknownArgumentError | undefined;
    try {
      options.checkUnknownBang();
    } catch (e) {
      error = e as UnknownArgumentError;
    }
    expect(error).toBeInstanceOf(UnknownArgumentError);
    expect(error!.unknown).toEqual(["--bar", "-z"]);
    expect(error!.switches).toEqual(["--foo"]);
  });

  it("stops at the first unknown when stop_on_unknown is set", () => {
    const options = create({ foo: ":boolean" }, {}, true);
    expect(parse(options, "--foo", "cmd", "--foo", "--bar")).toEqual({ foo: true });
    expect(options.remaining()).toEqual(["cmd", "--foo", "--bar"]);
    expect(() => options.checkUnknownBang()).not.toThrow();
  });

  it("parses a boolean from the string and the boolean value sets", () => {
    const options = create({ foo: ":boolean" });
    for (const value of ["true", "TRUE", "t", "T", true]) {
      expect(parse(options, "--foo", value)).toEqual({ foo: true });
      expect(options.remaining()).toEqual([]);
    }
    for (const value of ["false", "FALSE", "f", "F"]) {
      expect(parse(options, "--foo", value)).toEqual({ foo: false });
      expect(options.remaining()).toEqual([]);
    }
    expect(parse(options, "--foo", false)).toEqual({ foo: true });
    expect(options.remaining()).toEqual([]);
    expect(parse(options, "--foo", "bar")).toEqual({ foo: true });
    expect(options.remaining()).toEqual(["bar"]);
    expect(parse(options, "--no-foo")).toEqual({ foo: false });
    expect(parse(options, "--skip-foo")).toEqual({ foo: false });
  });

  it("keeps a declared --no- switch true", () => {
    expect(parse(create({ "no-foo": ":boolean" }), "--no-foo")).toEqual({ "no-foo": true });
  });

  it("answers a valueless string switch with lazy_default, then default, then the human name", () => {
    expect(parse(create({ foo: ":string" }), "--foo")).toEqual({ foo: "foo" });
    expect(
      parse(create({ foo: new Option("foo", { lazyDefault: "lazy", default: "d" }) }), "--foo"),
    ).toEqual({ foo: "lazy" });
    expect(parse(create({ foo: new Option("foo", { default: "d" }) }), "--foo")).toEqual({
      foo: "d",
    });
    expect(parse(create({ foo: new Option("foo", { default: "" }) }), "--foo")).toEqual({
      foo: "",
    });
    expect(parse(create({ foo: ":string" }), "--no-foo")).toEqual({ foo: null });
  });

  it("raises for a valueless non-string switch with no lazy_default", () => {
    expect(() => create({ foo: ":numeric" }).parse(["--foo"])).toThrow(
      new MalformattedArgumentError("No value provided for option '--foo'"),
    );
    expect(
      parse(create({ foo: new Option("foo", { type: "numeric", lazyDefault: 7 }) }), "--foo"),
    ).toEqual({ foo: 7 });
  });

  it("collects repeatable options into an array or a merged hash", () => {
    const options = create({
      list: new Option("list", { type: "string", repeatable: true }),
      map: new Option("map", { type: "hash", repeatable: true }),
    });
    expect(parse(options, "--list", "a", "--map", "a:b", "--list", "b", "--map", "c:d")).toEqual({
      list: ["a", "b"],
      map: { a: "b", c: "d" },
    });
  });

  it("names the class in the exclusive and at-least-one errors", () => {
    const exclusive = create({ foo: ":boolean", bar: ":boolean" }, {}, false, {
      exclusiveOptionNames: [["foo", "bar"], []],
    });
    expect(parse(exclusive, "--foo")).toEqual({ foo: true });
    expect(() => exclusive.parse(["--foo", "--bar"])).toThrow(
      new ExclusiveArgumentError("Found exclusive options '--foo', '--bar'"),
    );

    const atLeastOne = create({ foo: ":boolean", bar: ":boolean" }, {}, false, {
      atLeastOneOptionNames: [["foo", "bar"]],
    });
    expect(() => atLeastOne.parse([])).toThrow(
      new AtLeastOneRequiredArgumentError(
        "Not found at least one of required options '--foo', '--bar'",
      ),
    );
  });

  it("answers current_is_value? with the peek itself when it is nil or false", () => {
    const currentIsValue = (peek: unknown) => {
      const options = create({});
      rbObjIvarSet(options, "@pile", [peek]);
      return rbFSend(options, "isCurrentIsValue");
    };
    expect(currentIsValue(null)).toBeNull();
    expect(currentIsValue(false)).toBe(false);
    expect(currentIsValue("b")).toBe(true);
    expect(currentIsValue("--b")).toBe(true);
  });

  it("assigns defaults under string keys and answers a frozen indifferent hash", () => {
    const options = create({ foo: ":required" }, { foo: "d", other: 1 });
    const assigns = options.parse([]);
    expect(Object.fromEntries(assigns)).toEqual({ foo: "d", other: 1 });
    expect(() => assigns.set("x", 1)).toThrow(FrozenError);
  });
});
