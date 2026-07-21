import { describe, expect, it } from "vitest";
import { mergeBySourceLine } from "./source-order.js";

const m = (name: string, line?: number) => ({ name, line });
const names = (list: { name: string }[]) => list.map((x) => x.name);

describe("mergeBySourceLine", () => {
  it("puts a leading `class << self` block ahead of the instance methods", () => {
    // active_model/attribute.rb: factories at :8-:24, attr_reader at :29,
    // initialize at :33.
    const instance = [m("name", 29), m("value_before_type_cast", 29), m("initialize", 33)];
    const klass = [m("from_database", 8), m("from_user", 12), m("null", 20)];
    expect(names(mergeBySourceLine(instance, klass))).toEqual([
      "from_database",
      "from_user",
      "null",
      "name",
      "value_before_type_cast",
      "initialize",
    ]);
  });

  it("keeps a trailing `class << self` block after the instance methods", () => {
    const instance = [m("initialize", 5), m("call", 9)];
    const klass = [m("build", 20)];
    expect(names(mergeBySourceLine(instance, klass))).toEqual(["initialize", "call", "build"]);
  });

  it("interleaves class methods defined between instance methods", () => {
    const instance = [m("a", 5), m("c", 25)];
    const klass = [m("b", 15)];
    expect(names(mergeBySourceLine(instance, klass))).toEqual(["a", "b", "c"]);
  });

  it("preserves bucket order for methods sharing a line (multi-name attr_accessor)", () => {
    // `attr_accessor :singular, :plural` records every name at the statement's
    // first line; their declared order is the only signal.
    const instance = [m("singular", 12), m("plural", 12), m("element", 12)];
    expect(names(mergeBySourceLine(instance, []))).toEqual(["singular", "plural", "element"]);
  });

  it("sorts line-less entries last, preserving instance-then-class append order", () => {
    const instance = [m("i1"), m("i2")];
    const klass = [m("c1")];
    expect(names(mergeBySourceLine(instance, klass))).toEqual(["i1", "i2", "c1"]);
  });

  it("orders positioned entries ahead of line-less ones", () => {
    const instance = [m("unpositioned"), m("positioned", 3)];
    expect(names(mergeBySourceLine(instance, []))).toEqual(["positioned", "unpositioned"]);
  });

  it("defaults both buckets to empty", () => {
    expect(mergeBySourceLine()).toEqual([]);
  });
});
