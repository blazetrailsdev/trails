import { describe, expect, it } from "vitest";
import { toYaml } from "./yaml.js";
import { Struct } from "./struct.js";
import { Range } from "./range.js";
import { registerConstant } from "./variable.js";
import { Module, rbModConstSet } from "./include.js";

function cleanYaml(yaml: string): string {
  return yaml.replace(/([^-]|^---)[ \t]+\n/gm, "$1\n").replace(/\n\.\.\.\n$/, "\n");
}

const YAMLSpecs = rbModConstSet(Object, "YAMLSpecs", new Module());
const Example = rbModConstSet(
  YAMLSpecs,
  "Example",
  class Example {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
  },
);

describe("Object#to_yaml", () => {
  it("returns the YAML representation of an Array object", () => {
    expect(cleanYaml(toYaml(["30", "ruby", "maz", "irb", "99"]).replaceAll("'", '"'))).toBe(
      cleanYaml('--- \n- "30"\n- ruby\n- maz\n- irb\n- "99"\n'),
    );
  });

  it("returns the YAML representation of a Hash object", () => {
    expect(cleanYaml(toYaml({ a: "b" }))).toBe(cleanYaml("--- \na: b\n"));
  });

  it("returns the YAML representation of an object", () => {
    expect(cleanYaml(toYaml(new Example("baz")))).toBe(
      cleanYaml("--- !ruby/object:YAMLSpecs::Example\nname: baz\n"),
    );
  });

  it("returns the YAML representation of a Class object", () => {
    expect(cleanYaml(toYaml(Example))).toBe(cleanYaml("--- !ruby/class 'YAMLSpecs::Example'\n"));
  });

  // PERMANENT-SKIP: ruby-compat does not port Enumerable as a Module object.
  it.skip("returns the YAML representation of a Module object");

  // PERMANENT-SKIP: Date lives in @blazetrails/date, which depends on ruby-compat; its dump is covered there.
  it.skip("returns the YAML representation of a Date object");

  it("returns the YAML representation of a FalseClass", () => {
    const falseKlass = false;
    expect(typeof falseKlass).toBe("boolean");
    expect(cleanYaml(toYaml(falseKlass))).toBe(cleanYaml("--- false\n"));
  });

  it("returns the YAML representation of a Float object", () => {
    const float = 1.2;
    expect(typeof float).toBe("number");
    expect(cleanYaml(toYaml(float))).toBe(cleanYaml("--- 1.2\n"));
  });

  it("returns the YAML representation of an Integer object", () => {
    const int = 20;
    expect(Number.isInteger(int)).toBe(true);
    expect(cleanYaml(toYaml(int))).toBe(cleanYaml("--- 20\n"));
  });

  it("returns the YAML representation of a NilClass object", () => {
    const nilKlass = null;
    expect(nilKlass).toBeNull();
    expect(cleanYaml(toYaml(nilKlass))).toBe(cleanYaml("--- \n"));
  });

  it("returns the YAML representation of a RegExp object", () => {
    expect(cleanYaml(toYaml(new RegExp("^a-z+:\\s+\\w+")))).toBe(
      cleanYaml("--- !ruby/regexp /^a-z+:\\s+\\w+/\n"),
    );
  });

  it("returns the YAML representation of a String object", () => {
    expect(cleanYaml(toYaml("I love Ruby"))).toBe(cleanYaml("--- I love Ruby\n"));
  });

  it("returns the YAML representation of a Struct object", () => {
    const Person = Struct.new("name", "gender");
    registerConstant("Person", Person);
    expect(cleanYaml(toYaml(new Person("Jane", "female")))).toBe(
      cleanYaml("--- !ruby/struct:Person\nname: Jane\ngender: female\n"),
    );
  });

  it("returns the YAML representation of an unnamed Struct object", () => {
    const person = Struct.new("name", "gender");
    expect(cleanYaml(toYaml(new person("Jane", "female")))).toBe(
      cleanYaml("--- !ruby/struct\nname: Jane\ngender: female\n"),
    );
  });

  it("returns the YAML representation of a Symbol object", () => {
    expect(cleanYaml(toYaml(":symbol"))).toBe(cleanYaml("--- :symbol\n"));
  });

  // PERMANENT-SKIP: Time lives in @blazetrails/date, which depends on ruby-compat; its dump is covered there.
  it.skip("returns the YAML representation of a Time object");

  it("returns the YAML representation of a TrueClass", () => {
    const trueKlass = true;
    expect(typeof trueKlass).toBe("boolean");
    expect(cleanYaml(toYaml(trueKlass))).toBe(cleanYaml("--- true\n"));
  });

  // PERMANENT-SKIP: V8 captures an Error's stack at construction, so a never-raised exception's backtrace is not nil.
  it.skip("returns the YAML representation of a Error object");

  it("returns the YAML representation for Range objects", () => {
    const yaml = toYaml(new Range(1, 3));
    expect(yaml.includes("!ruby/range")).toBe(true);
    expect(yaml.includes("begin: 1")).toBe(true);
    expect(yaml.includes("end: 3")).toBe(true);
    expect(yaml.includes("excl: false")).toBe(true);
  });

  it("returns the YAML representation of numeric constants", () => {
    expect(cleanYaml(toYaml(NaN).toLowerCase())).toBe(cleanYaml("--- .nan\n"));
    expect(cleanYaml(toYaml(Infinity).toLowerCase())).toBe(cleanYaml("--- .inf\n"));
    expect(cleanYaml(toYaml(-Infinity).toLowerCase())).toBe(cleanYaml("--- -.inf\n"));
  });

  it("returns the YAML representation of an array of hashes", () => {
    const players = [{ a: "b" }, { b: "c" }];
    expect(cleanYaml(toYaml(players))).toBe(cleanYaml("--- \n- a: b\n- b: c\n"));
  });
});
