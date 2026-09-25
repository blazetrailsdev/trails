import { describe, it, expect } from "vitest";
import {
  basicObjRespondTo,
  rbInspect as inspect,
  rbObjInspect,
  rbObjId,
  rbObjAsString as toS,
  rbObjRespondTo,
} from "./object.js";

describe("Object#inspect", () => {
  it("renders nested arrays, hashes, nil, strings and numbers as MRI does", () => {
    expect(inspect([1, [2, "a"], { ":b": 3 }, null])).toBe('[1, [2, "a"], {:b=>3}, nil]');
    expect(inspect({ a: [1, null] })).toBe('{"a"=>[1, nil]}');
    expect(inspect(["x", ":y", 2.5, true])).toBe('["x", :y, 2.5, true]');
  });

  it("renders empty collections and nil", () => {
    expect(inspect([])).toBe("[]");
    expect(inspect({})).toBe("{}");
    expect(inspect(null)).toBe("nil");
    expect(inspect(undefined)).toBe("nil");
  });

  it("escapes a quote inside a string", () => {
    expect(inspect('q"u')).toBe('"q\\"u"');
  });
});

describe("Object#to_s", () => {
  it("is inspect for Array and Hash and the value's own to_s otherwise", () => {
    expect(toS(3)).toBe("3");
    expect(toS(null)).toBe("");
    expect(toS("hi")).toBe("hi");
    expect(toS([{ a: 1 }])).toBe('[{"a"=>1}]');
  });
});

describe("Object#respond_to?", () => {
  it("answers for a method the receiver's class defines, nil included", () => {
    expect(basicObjRespondTo({ id: 1 }, "id")).toBe(true);
    expect(basicObjRespondTo({}, "id")).toBe(false);
    expect(basicObjRespondTo(null, "toString")).toBe(true);
    expect(basicObjRespondTo(null, "id")).toBe(false);
  });

  it("sends an overridden respond_to? and otherwise falls back to the default", () => {
    // vendor/ruby/vm_method.c:2882 vm_respond_to, :2945 the basic_obj_respond_to fallback.
    const overriding = { respondTo: (mid: string) => mid === "name" };
    expect(rbObjRespondTo(overriding, "name")).toBe(true);
    expect(rbObjRespondTo(overriding, "respondTo")).toBe(false);
    expect(rbObjRespondTo({ id: 1 }, "id")).toBe(true);
  });

  it("answers to_str for a String, which String.prototype does not define", () => {
    // vendor/ruby/string.c:12177 rb_define_method(rb_cString, "to_str", rb_str_to_s, 0).
    expect(basicObjRespondTo("foo bar", "toStr")).toBe(true);
    expect(basicObjRespondTo({}, "toStr")).toBe(false);
  });

  it("answers Module#respond_to? for a class: its methods, not its static data or Function.prototype", () => {
    class Klass {
      static data = 1;
      static method(): void {}
      static get reader(): number {
        return 1;
      }
    }
    class Sub extends Klass {}
    expect(basicObjRespondTo(Sub, "method")).toBe(true);
    expect(basicObjRespondTo(Sub, "reader")).toBe(true);
    expect(basicObjRespondTo(Sub, "data")).toBe(false);
    for (const name of ["call", "apply", "bind", "hasOwnProperty"]) {
      expect(basicObjRespondTo(Sub, name)).toBe(false);
    }
  });
});

describe("rbObjInspect", () => {
  it("renders a self-referencing ivar as ... instead of recursing", () => {
    class Node {
      self: unknown = null;
      inspect(): string {
        return rbObjInspect(this);
      }
    }
    const node = new Node();
    node.self = node;
    expect(node.inspect()).toMatch(/^#<Node:0x[0-9a-f]{16} @self=#<Node:0x[0-9a-f]{16} \.\.\.>>$/);
  });
});

describe("rbObjId", () => {
  it("is stable per object and OBJ_ID_INCREMENT apart", () => {
    const a = {};
    const b = {};
    const id = rbObjId(a);

    expect(rbObjId(a)).toBe(id);
    expect(rbObjId(b)).toBe(id + 20);
  });
});
