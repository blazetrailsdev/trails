import { describe, expect, it } from "vitest";
import { NoMethodError, Range } from "@blazetrails/ruby-compat";
import { MalformattedArgumentError, RequiredArgumentMissingError } from "../error.js";
import { Argument } from "./argument.js";
import { Arguments } from "./arguments.js";

describe("Thor::Arguments", () => {
  it("splits the arguments from the switches at the first dash-led string", () => {
    expect(Arguments.split(["a", 1, "--b", "c"])).toEqual([
      ["a", 1],
      ["--b", "c"],
    ]);
    expect(Arguments.split(["a"])).toEqual([["a"], []]);
  });

  it("parses through the class method, taking the pile as the last argument", () => {
    const string = new Argument("string");
    expect(Arguments.parse([string], ["name"])).toEqual({ string: "name" });
  });

  it("never mutates a declared Array or Hash default", () => {
    const array = new Argument("array", { type: "array", required: false, default: ["a"] });
    const hash = new Argument("hash", { type: "hash", required: false, default: { a: "b" } });
    const assigns = new Arguments([array, hash]).parse([]);
    (assigns.array as string[]).push("c");
    (assigns.hash as Record<string, string>).c = "d";
    expect(array.default).toEqual(["a"]);
    expect(hash.default).toEqual({ a: "b" });
  });

  it("assigns an argument named __proto__", () => {
    const proto = new Argument("__proto__", { required: false, default: "a" });
    expect(Object.keys(new Arguments([proto]).parse([]))).toEqual(["__proto__"]);
    expect(Object.keys(new Arguments([proto]).parse(["b"]))).toEqual(["__proto__"]);
  });

  it("assigns a false or zero default", () => {
    const flag = new Argument("flag", { required: false, default: false });
    const count = new Argument("count", { type: "numeric", required: false, default: 0 });
    expect(new Arguments([flag, count]).parse([])).toEqual({ flag: false, count: 0 });
  });

  it("reads a leading-dot numeric as a float and rejects a partial match", () => {
    const numeric = new Argument("numeric", { type: "numeric" });
    expect(new Arguments([numeric]).parse([".5"])).toEqual({ numeric: 0.5 });
    expect(() => new Arguments([numeric]).parse([["13"]])).toThrow(
      new MalformattedArgumentError(`Expected numeric value for 'numeric'; got ["13"]`),
    );
    expect(() => new Arguments([numeric]).parse(["13a"])).toThrow(
      new MalformattedArgumentError(`Expected numeric value for 'numeric'; got "13a"`),
    );
  });

  it("raises on a hash key given twice and keeps the rest of a value after its first colon", () => {
    const hash = new Argument("hash", { type: "hash" });
    expect(() => new Arguments([hash]).parse(["a:b", "a:c"])).toThrow(
      new MalformattedArgumentError(
        "You can't specify 'a' more than once in option 'hash'; got a:b and a:c",
      ),
    );
    expect(new Arguments([hash]).parse(["a:"])).toEqual({ hash: { a: "" } });
    const parsed = new Arguments([hash]).parse(["__proto__:x"]).hash as Record<string, string>;
    expect(Object.keys(parsed)).toEqual(["__proto__"]);
  });

  it("dispatches the type to its parse method by name", () => {
    class Typed extends Argument {
      static override VALID_TYPES = [...Argument.VALID_TYPES, "boolean"];
    }
    expect(() => new Arguments([new Typed("flag", { type: "boolean" })]).parse(["x"])).toThrow(
      NoMethodError,
    );
  });

  it("skips the enum check while the switches are an Array", () => {
    const string = new Argument("string", { enum: ["a", "b"] });
    expect(new Arguments([string]).parse(["c"])).toEqual({ string: "c" });
  });

  it("checks the enum once a subclass keys the switches by name", () => {
    class Keyed extends Arguments {
      constructor(arguments_: Argument[]) {
        super(arguments_);
        this.switches = Object.fromEntries(arguments_.map((a) => [a.humanName, a]));
      }

      override parse(args: unknown[]): Record<string, unknown> {
        this.pile = args;
        return {
          string: this.parseString("string"),
          numeric: this.parseNumeric("numeric"),
        };
      }
    }
    const string = new Argument("string", { enum: ["a", "b"] });
    const numeric = new Argument("numeric", { type: "numeric", enum: new Range(1, 3) });
    expect(new Keyed([string, numeric]).parse(["a", "2"])).toEqual({ string: "a", numeric: 2 });
    const set = new Argument("string", { enum: new Set(["a", "b"]) });
    const hash = new Argument("string", { enum: { a: 1, b: 2 } });
    expect(new Keyed([set, numeric]).parse(["b", "2"]).string).toBe("b");
    expect(new Keyed([hash, numeric]).parse(["b", "2"]).string).toBe("b");
    expect(() => new Keyed([hash, numeric]).parse(["c", "2"])).toThrow(NoMethodError);
    expect(() => new Keyed([set, numeric]).parse(["c", "2"])).toThrow(
      new MalformattedArgumentError("Expected 'string' to be one of a, b; got c"),
    );
    expect(() => new Keyed([string, numeric]).parse(["c", "2"])).toThrow(
      new MalformattedArgumentError("Expected 'string' to be one of a, b; got c"),
    );
    expect(() => new Keyed([string, numeric]).parse(["a", "4"])).toThrow(
      new MalformattedArgumentError("Expected 'numeric' to be one of 1..3; got 4"),
    );
  });

  it("names the missing requirement after the Ruby class, not the JS one", () => {
    const name = Object.getOwnPropertyDescriptor(Arguments, "name")!;
    Object.defineProperty(Arguments, "name", { ...name, value: "q" });
    try {
      expect(() => new Arguments([new Argument("string")]).parse([])).toThrow(
        new RequiredArgumentMissingError("No value provided for required arguments 'string'"),
      );
    } finally {
      Object.defineProperty(Arguments, "name", name);
    }
  });
});
