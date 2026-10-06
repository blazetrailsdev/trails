import { describe, it, expect } from "vitest";
import {
  rbCBasicObject,
  rbCDate,
  rbCDateTime,
  rbCNumeric,
  rbCTime,
  rbClassSuperclass,
  basicObjRespondTo,
  objRespondToMissing,
  rbInspect as inspect,
  rbObjInspect,
  rbObjId,
  rbObjAsString as toS,
  rbObjRespondTo,
  OBJECT_METHOD_TABLE,
  rbFPublicSend,
  rbModAttrReader,
  rbModAttrWriter,
  rbModMethodDefined,
  rbFSend,
  toS as toSSend,
  toSym,
  isNil,
  rbModPublicMethodDefined,
  rbDeclareIvar,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
  rbModName,
  rbModToS,
  rbObjClassname,
  rbSetClassPathString,
} from "./object.js";
import {
  Kernel,
  Module,
  include,
  rbModAncestors,
  rbModInstanceMethod,
  rbObjIsKindOf,
} from "./include.js";
import { BigDecimal } from "./big-decimal.js";
import { Complex } from "./complex.js";
import { Rational } from "./rational.js";
import { TypeError } from "./type-error.js";
import { cmp } from "./comparable.js";
import { Range } from "./range.js";
import { ArgumentError } from "./argument-error.js";
import { NameError } from "./name-error.js";
import { FrozenError } from "./frozen-error.js";
import { NoMethodError } from "./no-method-error.js";
import { rbModConstSet } from "./include.js";

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

  it("renders a Regexp with Ruby's option letters, dotAll as m", () => {
    expect(inspect(/(david|jamis)/s)).toBe("/(david|jamis)/m");
    expect(inspect(/a\/b/is)).toBe("/a\\/b/mi");
    expect(inspect(/x/)).toBe("/x/");
    expect(inspect(new RegExp("a/b"))).toBe("/a\\/b/");
  });
  it("quotes a Symbol whose name is not a symname, as sym_inspect does", () => {
    const names = ["foo", "Foo", "foo?", "foo!", "foo=", "foo?=", "de-AT", "@a", "@@a", "$a"];
    names.push("$1", "$~", "[]", "[]=", "<=>", "==", "=", "+@", "!", "a b", "", "1a", "é", "@1");
    expect(names.map((name) => inspect(`:${name}`))).toEqual([
      ":foo",
      ":Foo",
      ":foo?",
      ":foo!",
      ":foo=",
      ':"foo?="',
      ':"de-AT"',
      ":@a",
      ":@@a",
      ":$a",
      ":$1",
      ":$~",
      ":[]",
      ":[]=",
      ":<=>",
      ":==",
      ':"="',
      ":+@",
      ":!",
      ':"a b"',
      ':""',
      ':"1a"',
      ":é",
      ':"@1"',
    ]);
  });

  it("follows rb_enc_symname_type's operator and sigil arms", () => {
    const names =
      "! != !~ !@ ~ ~@ + +@ - -@ * ** / % & | ^ < << <= <=> > >> >= = == === =~ [] []= [ ] ` `@ !! =! a? a! a= A= A? @a? $a? @a= @@a= $a= $- $-w $-ww $12 $0 $_ $~ $_a";
    expect(
      names
        .split(" ")
        .map((name) => inspect(`:${name}`))
        .join(" "),
    ).toBe(
      ':! :!= :!~ :"!@" :~ :"~@" :+ :+@ :- :-@ :* :** :/ :% :& :| :^ :< :<< :<= :<=> :> :>> :>= :"=" :== :=== :=~ :[] :[]= :"[" :"]" :` :"`@" :"!!" :"=!" :a? :a! :a= :A= :A? :"@a?" :"$a?" :"@a=" :"@@a=" :"$a=" :"$-" :$-w :"$-ww" :$12 :$0 :$_ :$~ :$_a',
    );
  });
});

describe("Object#to_s", () => {
  it("is inspect for Array and Hash and the value's own to_s otherwise", () => {
    expect(toS(3)).toBe("3");
    expect(toS(null)).toBe("");
    expect(toS("hi")).toBe("hi");
    const bytes = new Uint8Array([0x80, 0x81]);
    expect(toS(bytes)).toBe(bytes);
    class Data {
      toString() {
        return bytes;
      }
    }
    expect(toS(new Data())).toBe(bytes);
    let sends = 0;
    class Counted {
      toString() {
        sends += 1;
        return "counted";
      }
    }
    expect(toS(new Counted())).toBe("counted");
    expect(sends).toBe(1);
    expect(toS([{ a: 1 }])).toBe('[{"a"=>1}]');
  });

  it("is the class name for a class", () => {
    class Named {
      perform() {}
    }
    expect(toS(Named)).toBe("Named");
    expect(toSSend(Named)).toBe("Named");
    class Custom {
      static toS() {
        return "custom";
      }
    }
    expect(toS(Custom)).toBe("custom");
  });

  it("sends to_s to a receiver defining it", () => {
    expect(toS(new Range(1, 3))).toBe("1..3");
    class Ported {
      toS(): string {
        return "ported";
      }
    }
    expect(toS(new Ported())).toBe("ported");
    expect(toS(Object.assign(() => {}, { toS: () => "proc" }))).toBe("proc");
    class Unported {
      toS(): number {
        return 1;
      }
    }
    expect(toS(new Unported())).toMatch(/^#<Unported/);
  });
});

describe("Object#respond_to_missing?", () => {
  it("answers false for every name", () => {
    expect(objRespondToMissing({ id: 1 }, "id", false)).toBe(false);
    expect(objRespondToMissing({}, "missing", true)).toBe(false);
  });
});

describe("Object#respond_to?", () => {
  it("answers for a method the receiver's class defines, nil included", () => {
    expect(basicObjRespondTo({ id: 1 }, "id")).toBe(true);
    expect(basicObjRespondTo({}, "id")).toBe(false);
    expect(basicObjRespondTo(null, "toString")).toBe(true);
    expect(basicObjRespondTo(null, "id")).toBe(false);
  });

  it("answers and dispatches the methods bound on a Temporal seat", () => {
    const date = { [Symbol.toStringTag]: "Temporal.PlainDate" };
    const plain = { toPlainDate: () => date };
    const datetime = { [Symbol.toStringTag]: "Temporal.PlainDateTime", ...plain };
    expect(basicObjRespondTo(date, "toDate")).toBe(true);
    expect(basicObjRespondTo(datetime, "toDate")).toBe(true);
    expect(basicObjRespondTo({ [Symbol.toStringTag]: "Temporal.Instant" }, "toDate")).toBe(false);
    expect(basicObjRespondTo("2026-01-01", "toDate")).toBe(false);
    expect(rbFSend(date, "toDate")).toBe(date);
    expect(rbFSend(datetime, "toDate")).toBe(date);
  });

  it("does not answer length or name for a Proc", () => {
    expect(basicObjRespondTo((a: unknown, b: unknown) => [a, b], "length")).toBe(false);
    expect(basicObjRespondTo(function named() {}, "name")).toBe(false);
    expect(basicObjRespondTo(() => {}, "call")).toBe(true);
    expect(basicObjRespondTo("abc", "length")).toBe(true);
    expect(basicObjRespondTo([1], "length")).toBe(true);
  });

  it("sends an overridden respond_to? and otherwise falls back to the default", () => {
    // vendor/ruby/v3.3.11/vm_method.c:2882 vm_respond_to, :2945 the basic_obj_respond_to fallback.
    const overriding = { isRespondTo: (mid: string) => mid === "name" };
    expect(rbObjRespondTo(overriding, "name")).toBe(true);
    expect(rbObjRespondTo(overriding, "respondTo")).toBe(false);
    expect(rbObjRespondTo({ id: 1 }, "id")).toBe(true);
  });

  it("answers a writer name= for an accessor's setter, not for a getter alone", () => {
    class Klass {
      static get reader(): number {
        return 1;
      }
      static get option(): number {
        return 1;
      }
      static set option(_value: number) {}
    }
    expect(basicObjRespondTo(Klass, "option=")).toBe(true);
    expect(basicObjRespondTo(class extends Klass {}, "option=")).toBe(true);
    expect(basicObjRespondTo(Klass, "reader=")).toBe(false);
    expect(basicObjRespondTo(Klass, "missing=")).toBe(false);
  });

  it("answers to_str for a String, which String.prototype does not define", () => {
    // vendor/ruby/v3.3.11/string.c:12177 rb_define_method(rb_cString, "to_str", rb_str_to_s, 0).
    expect(basicObjRespondTo("foo bar", "toStr")).toBe(true);
    expect(basicObjRespondTo({}, "toStr")).toBe(false);
  });

  it("answers to_ary for an Array, which Array.prototype does not define", () => {
    // vendor/ruby/v3.3.11/array.c:8619 rb_define_method(rb_cArray, "to_ary", rb_ary_to_ary_m, 0).
    expect(basicObjRespondTo([], "toAry")).toBe(true);
    expect(basicObjRespondTo({}, "toAry")).toBe(false);
  });

  it("answers [] for an Array, a Hash and a String, whose JS values index without a method", () => {
    for (const obj of ["abc", [1], new Map(), {}]) {
      expect(basicObjRespondTo(obj, "get")).toBe(true);
    }
    expect(basicObjRespondTo(new Set([1]), "get")).toBe(false);
    expect(basicObjRespondTo(null, "get")).toBe(false);
    expect(basicObjRespondTo(true, "get")).toBe(false);
  });

  it("answers each for an Array, a Set and a Hash, which their JS values do not define", () => {
    for (const obj of [["-h"], new Set([1]), new Map(), {}]) {
      expect(rbObjRespondTo(obj, "each")).toBe(true);
    }
    expect(rbObjRespondTo("-h", "each")).toBe(false);
    expect(rbObjRespondTo(1, "each")).toBe(false);
  });

  it("answers include? for the core collections and to_sym for a String, which their JS values do not define", () => {
    for (const obj of ["abc", [1], new Set([1]), new Map(), {}]) {
      expect(basicObjRespondTo(obj, "isInclude")).toBe(true);
    }
    expect(basicObjRespondTo("abc", "toSym")).toBe(true);
    expect(basicObjRespondTo([1], "toSym")).toBe(false);
    expect(basicObjRespondTo(1, "isInclude")).toBe(false);
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

  it("answers a special constant's own VALUE", () => {
    expect(rbObjId(null)).toBe(4);
    expect(rbObjId(undefined)).toBe(4);
    expect(rbObjId(true)).toBe(20);
    expect(rbObjId(false)).toBe(0);
    expect(rbObjId(1)).toBe(3);
    expect(rbObjId(-3)).toBe(-5);
    expect(rbObjId(21n)).toBe(43);
    expect(rbObjId(1.5)).toBe(-18014398509481982n);
    expect(rbObjId(2.0000000000000004)).toBe(10);
  });

  it("hands a string, a Bignum and a non-flonum Float a fresh heap id per send", () => {
    expect(rbObjId("a")).not.toBe(rbObjId("a"));
    expect(rbObjId(2n ** 70n)).not.toBe(rbObjId(2n ** 70n));
    expect(rbObjId(1e-300)).not.toBe(rbObjId(1e-300));
    expect(rbObjId(NaN)).not.toBe(rbObjId(NaN));
  });
});

class Req {
  field = "f";
  get host(): string {
    return "example.org";
  }
  subdomain(): string {
    return "clients";
  }
}

describe("rbFPublicSend include?", () => {
  it("answers for the core receivers with no isInclude entry of their own", () => {
    expect(rbFPublicSend("rubyist", "isInclude", "ruby")).toBe(true);
    expect(rbFPublicSend([1, 2], "isInclude", 2)).toBe(true);
    expect(rbFPublicSend(new Set([1]), "isInclude", 2)).toBe(false);
    expect(rbFPublicSend(new Map([["a", 1]]), "isInclude", "a")).toBe(true);
    expect(rbFPublicSend({ a: 1 }, "isInclude", "a")).toBe(true);
    expect(rbFPublicSend({ a: 1 }, "isInclude", "toString")).toBe(false);
  });

  it("looks a Set or Hash member up by eql?", () => {
    class Point {
      constructor(readonly x: number) {}
      eql(other: unknown): boolean {
        return other instanceof Point && other.x === this.x;
      }
      hash(): number {
        return this.x;
      }
    }
    expect(rbFPublicSend(new Set([new Point(1)]), "isInclude", new Point(1))).toBe(true);
    expect(rbFPublicSend(new Set([new Point(1)]), "isInclude", new Point(2))).toBe(false);
    expect(rbFPublicSend(new Map([[new Point(1), 1]]), "isInclude", new Point(1))).toBe(true);
  });

  it("raises NoMethodError for nil", () => {
    const send = (): unknown => rbFPublicSend(null, "isInclude", 1);
    expect(send).toThrow(NoMethodError);
    expect(send).toThrow("undefined method 'include?' for nil");
  });

  it("raises NoMethodError for a receiver that does not define it", () => {
    expect(() => rbFPublicSend(1, "isInclude", 1)).toThrow(NoMethodError);
  });

  it("raises TypeError for String#include? with a non-String", () => {
    expect(() => rbFPublicSend("rubyist", "isInclude", 1)).toThrow(
      "no implicit conversion of Integer into String",
    );
  });
});

describe("rbFSend", () => {
  it("sends a writer to a setName method, the conventions table's other writer spelling", () => {
    class Host {
      static log: unknown[] = [];
      static setDefineMethodAttribute(name: string, opts: object): string {
        this.log.push([name, opts]);
        return name;
      }
      name: string | undefined;
      setFirstName(value: string): void {
        this.name = value;
      }
      _setReflections(): void {}
    }
    expect(rbObjRespondTo(Host, "defineMethodAttribute=", true)).toBe(true);
    expect(rbObjRespondTo(Host, "defineMethodMissing=", true)).toBe(false);
    expect(rbFSend(Host, "defineMethodAttribute=", "title", { as: "title" })).toBe("title");
    expect(Host.log).toEqual([["title", { as: "title" }]]);

    const host = new Host();
    expect(rbObjRespondTo(host, "firstName=")).toBe(true);
    rbFSend(host, "first_name=", "David");
    expect(host.name).toBe("David");
    expect(rbObjRespondTo(host, "_reflections=")).toBe(false);
  });

  it("calls a method, a getter, or reads a field by name", () => {
    const req = new Req();
    expect(rbFSend(req, "subdomain")).toBe("clients");
    expect(rbFSend(req, "host")).toBe("example.org");
    expect(rbFSend(req, "field")).toBe("f");
  });

  it("sends a method Module#undef_method removed to method_missing, and an undefined property as a value", () => {
    class Undefined {
      field: undefined = undefined;
      methodMissing(mid: string): string {
        return `missing ${mid}`;
      }
    }
    Object.defineProperty(Undefined.prototype, "proto", { value: undefined, configurable: true });
    const mod = new Module();
    mod.defineMethod("title", () => "title");
    include(Undefined, mod);
    const host = new Undefined();
    expect(rbFSend(host, "title")).toBe("title");
    mod.undefMethod("title");
    expect(rbFSend(host, "title")).toBe("missing title");
    expect(rbFSend(host, "field")).toBeUndefined();
    expect(rbFSend(host, "proto")).toBeUndefined();
  });

  it("sends a String a method String is reopened with, and one JS String lacks", () => {
    expect(rbFSend("abc", "upcase")).toBe("ABC");
    expect(rbFSend("abc", "toUpperCase")).toBe("ABC");
    expect(() => rbFSend("abc", "nope")).toThrow(NoMethodError);
  });

  it("public_send dispatches a defined method as send does", () => {
    const req = new Req();
    expect(rbFPublicSend(req, "subdomain")).toBe(rbFSend(req, "subdomain"));
    expect(rbFPublicSend(req, ":subdomain")).toBe("clients");
    expect(() => rbFPublicSend(req, null)).toThrow("nil is not a symbol nor a string");
    expect(() => rbFPublicSend(req, { toStr: () => 1 })).toThrow(
      "can't convert Hash to String (Hash#to_str gives Integer)",
    );
    expect(() => rbFPublicSend(req, "nope")).toThrow(NoMethodError);
  });

  it("raises NoMethodError for an unbound name", () => {
    expect(() => rbFSend(new Req(), "nope")).toThrow(NoMethodError);
  });

  it("sends an operator by its Ruby name", () => {
    expect(rbFPublicSend(2, ">", 1)).toBe(true);
    expect(rbFPublicSend(1, ">=", 1)).toBe(true);
    expect(rbFPublicSend(2, "<", 1)).toBe(false);
    expect(rbFPublicSend(1n, "<=", 2)).toBe(true);
    expect(rbFPublicSend("b", ">", "a")).toBe(true);
    expect(rbFPublicSend([1], "==", [1])).toBe(true);
    expect(rbFPublicSend(1, "!=", "a")).toBe(true);
    expect(rbFPublicSend(1, "==", "a")).toBe(false);
    expect(rbFPublicSend(2, ":>", 1)).toBe(true);
    expect(rbFPublicSend(1, ":!=", 1)).toBe(false);
  });

  it("raises ArgumentError for an ordering operator <=> cannot place", () => {
    expect(() => rbFPublicSend(1, ">", "a")).toThrow(ArgumentError);
    expect(() => rbFPublicSend(1, ">", "a")).toThrow("comparison of Integer with String failed");
    expect(() => rbFPublicSend("a", "<", 1)).toThrow(ArgumentError);
  });

  it("answers false for an ordering operator with a NaN operand, as Float does", () => {
    for (const op of [">", ">=", "<", "<="]) {
      expect(rbFPublicSend(NaN, op, 1)).toBe(false);
      expect(rbFPublicSend(1, op, NaN)).toBe(false);
    }
  });

  it("sends == to the receiver's own ==", () => {
    const recv = { equals: (other: unknown) => other === "same" };
    expect(rbFPublicSend(recv, "==", "same")).toBe(true);
    expect(rbFPublicSend(recv, "!=", "same")).toBe(false);
  });

  it("sends an ordering operator to the receiver's own method before its <=>", () => {
    const recv = { greaterThan: () => "own", compareTo: () => -1 };
    expect(rbFPublicSend(recv, ">", 1)).toBe("own");
    expect(rbFPublicSend(recv, "<", 1)).toBe(true);
  });

  it("raises NoMethodError for an ordering operator the receiver does not define", () => {
    expect(() => rbFPublicSend(null, ">", 1)).toThrow(NoMethodError);
    expect(() => rbFPublicSend([1], ">", [0])).toThrow(NoMethodError);
    expect(() => rbFPublicSend(true, "<", false)).toThrow(NoMethodError);
  });

  it("answers infinite? for a Float and an Integer, whose JS values do not define it", () => {
    for (const obj of [Infinity, -Infinity, 1.5, NaN, 1, 1n]) {
      expect(rbObjRespondTo(obj, "isInfinite")).toBe(true);
    }
    expect(rbFSend(Infinity, "isInfinite")).toBe(1);
    expect(rbFSend(-Infinity, "isInfinite")).toBe(-1);
    expect(rbFSend(1.5, "isInfinite")).toBe(null);
    expect(rbFSend(NaN, "isInfinite")).toBe(null);
    expect(rbFSend(1n, "isInfinite")).toBe(null);
    expect(rbObjRespondTo("1", "isInfinite")).toBe(false);
    expect(() => rbFSend("1", "isInfinite")).toThrow(NoMethodError);
  });

  it("answers odd? and even? for an Integer alone", () => {
    expect(rbFPublicSend(3, ":odd?")).toBe(true);
    expect(rbFPublicSend(4, ":even?")).toBe(true);
    expect(rbFPublicSend(-3, "isEven")).toBe(false);
    expect(rbFPublicSend(4n, "isEven")).toBe(true);
    expect(rbFPublicSend(4n, "isOdd")).toBe(false);
    expect(() => rbFPublicSend(1.5, "isOdd")).toThrow(NoMethodError);
  });

  it("dispatches a method a package defines on Object, after the receiver's own", () => {
    OBJECT_METHOD_TABLE.isProbe = (self: unknown, other: unknown) => [self, other];
    try {
      expect(rbFPublicSend(3, ":probe?", 4)).toEqual([3, 4]);
      expect(rbFPublicSend({ "probe?": () => "own" }, ":probe?")).toBe("own");
    } finally {
      delete OBJECT_METHOD_TABLE.isProbe;
    }
    expect(() => rbFPublicSend(3, ":probe?", 4)).toThrow(NoMethodError);
  });
});

describe("rbModPublicMethodDefined", () => {
  it("answers a public method or accessor, inherited or own", () => {
    class SubReq extends Req {}
    expect(rbModPublicMethodDefined(Req, "subdomain")).toBe(true);
    expect(rbModPublicMethodDefined(Req, "host")).toBe(true);
    expect(rbModPublicMethodDefined(SubReq, "subdomain")).toBe(true);
  });

  it("does not answer a field, an Object.prototype member, or an unknown name", () => {
    expect(rbModPublicMethodDefined(Req, "field")).toBe(false);
    expect(rbModPublicMethodDefined(Req, "hasOwnProperty")).toBe(false);
    expect(rbModPublicMethodDefined(Req, "nope")).toBe(false);
  });
});

describe("rbModAttrReader / rbModAttrWriter / rbModMethodDefined", () => {
  it("defines a reader and a writer over one ivar, each keeping the other half", () => {
    class Person {}
    expect(rbModMethodDefined(Person, "name")).toBe(false);
    expect(rbModMethodDefined(Person, "name=")).toBe(false);

    rbModAttrReader(Person, "name");
    expect(rbModMethodDefined(Person, "name")).toBe(true);
    expect(rbModMethodDefined(Person, "name=")).toBe(false);

    rbModAttrWriter(Person, "name");
    expect(rbModMethodDefined(Person, "name=")).toBe(true);

    const person = new Person() as { name: unknown };
    expect(person.name).toBeNull();
    person.name = "dhh";
    expect(person.name).toBe("dhh");
    expect(rbObjIvarGet(person, "@name")).toBe("dhh");
  });

  it("defines the accessors in a Module's own method table", () => {
    const mod = new Module();
    mod.attrReader("terms");
    mod.attrWriter("terms");
    expect(mod.isMethodDefined("terms")).toBe(true);

    class Person {}
    include(Person, mod);
    const person = new Person() as { terms: unknown };
    person.terms = "1";
    expect(person.terms).toBe("1");
  });

  it("keeps an inherited writer when only the reader is defined", () => {
    class Base {
      written: unknown;
      set title(value: unknown) {
        this.written = value;
      }
    }
    class Sub extends Base {}
    rbModAttrReader(Sub, "title");

    const sub = new Sub() as unknown as { title: unknown; written: unknown };
    sub.title = "x";
    expect(sub.written).toBe("x");
    expect(sub.title).toBeNull();
  });
});

describe("rbObjIsKindOf", () => {
  it("answers through the class, its superclasses and its included modules", () => {
    class Base {}
    class Sub extends Base {}
    const mod = new Module();
    mod.appendFeatures(Base);
    expect(rbObjIsKindOf(new Sub(), Sub)).toBe(true);
    expect(rbObjIsKindOf(new Sub(), Base)).toBe(true);
    expect(rbObjIsKindOf(new Sub(), mod)).toBe(true);
    expect(rbObjIsKindOf(new Base(), Sub)).toBe(false);
    expect(rbObjIsKindOf(new Sub(), Kernel)).toBe(true);
    expect(rbObjIsKindOf(new Sub(), rbCBasicObject)).toBe(true);
  });

  it("answers for a module included by an included module", () => {
    class K {}
    const m1 = new Module();
    const m2 = new Module();
    m1.include(m2);
    include(K, m1);
    expect(rbObjIsKindOf(new K(), m1)).toBe(true);
    expect(rbObjIsKindOf(new K(), m2)).toBe(true);
    expect(rbModAncestors(K)).toContain(m2);
  });

  it("raises TypeError for an argument that is no class or module", () => {
    expect(() => rbObjIsKindOf(1, 5)).toThrow(TypeError);
    expect(() => rbObjIsKindOf(1, 5)).toThrow("class or module required");
    expect(() => rbObjIsKindOf(1, null)).toThrow("class or module required");
  });

  it("reads every Numeric seat as a Numeric", () => {
    for (const n of [1, 1.5, 1n, new Rational(1, 2), new BigDecimal("1.1"), new Complex(1, 0)]) {
      expect(rbObjIsKindOf(n, rbCNumeric)).toBe(true);
      expect(rbObjIsKindOf(n, rbCTime)).toBe(false);
    }
    expect(rbObjIsKindOf("1", rbCNumeric)).toBe(false);
    expect(rbObjIsKindOf(null, rbCNumeric)).toBe(false);
  });

  it("reads the Time, DateTime and Date seats", () => {
    expect(rbObjIsKindOf(new Date(0), rbCTime)).toBe(true);
    const instant = { [Symbol.toStringTag]: "Temporal.Instant", epochNanoseconds: 0n };
    expect(rbObjIsKindOf(instant, rbCTime)).toBe(true);
    const dateTime = { [Symbol.toStringTag]: "Temporal.PlainDateTime" };
    expect(rbObjIsKindOf(dateTime, rbCDateTime)).toBe(true);
    expect(rbObjIsKindOf(dateTime, rbCDate)).toBe(true);
    const date = { [Symbol.toStringTag]: "Temporal.PlainDate" };
    expect(rbObjIsKindOf(date, rbCDate)).toBe(true);
    expect(rbObjIsKindOf(date, rbCDateTime)).toBe(false);
    expect(rbObjIsKindOf(date, rbCTime)).toBe(false);
  });
});

describe("rbModAncestors / rbModInstanceMethod", () => {
  it("orders an included Module above the class and names the owner of a method", () => {
    class Base {
      serialize(): void {}
    }
    class Sub extends Base {}
    const mod = new Module();
    mod.defineMethod("cast", () => {});
    mod.appendFeatures(Sub);
    expect(rbModAncestors(Sub)).toEqual([Sub, mod, Base, Object, Kernel, rbCBasicObject]);
    expect(rbModInstanceMethod(Sub, "cast").owner).toBe(mod);
    expect(rbModInstanceMethod(Sub, "serialize").owner).toBe(Base);
    expect(() => rbModInstanceMethod(Sub, "nope")).toThrow(NameError);
  });

  it("names the module include() copied a method from, and the class for its own", () => {
    const first = { cast() {}, serialize() {} };
    const second = { cast() {} };
    class Mixin {
      deserialize(): void {}
    }
    class Type {
      serialize(): void {}
    }
    include(Type, first);
    include(Type, second);
    include(Type, Mixin);
    const ancestors = rbModAncestors(Type);
    expect(ancestors.slice(0, 4)).toEqual([Type, Mixin, second, first]);
    expect(rbModInstanceMethod(Type, "cast").owner).toBe(second);
    expect(rbModInstanceMethod(Type, "deserialize").owner).toBe(Mixin);
    expect(rbModInstanceMethod(Type, "serialize").owner).toBe(Type);
  });

  it("raises NameError for an Object.prototype member, which method_defined? does not answer", () => {
    class Type {}
    expect(rbModPublicMethodDefined(Type, "hasOwnProperty")).toBe(false);
    expect(() => rbModInstanceMethod(Type, "hasOwnProperty")).toThrow(NameError);
  });
});

describe("Kernel#instance_variable_get / instance_variable_set", () => {
  class Holder {
    fooBar = 1;
    _items: number[] = [];
    get items(): number[] {
      return this._items;
    }
  }
  rbDeclareIvar(Holder, "@items", "_items");
  class SubHolder extends Holder {}

  it("names each field by its declaration or the field-name rule", () => {
    expect(rbObjInstanceVariables(new Holder())).toEqual(["@foo_bar", "@items"]);
  });

  it("reads and writes the declared field, never through the reader", () => {
    const o = new SubHolder();
    expect(rbObjIvarSet(o, "@items", [2])).toEqual([2]);
    expect(o._items).toEqual([2]);
    expect(Object.hasOwn(o, "items")).toBe(false);
    expect(rbObjIvarGet(o, "@items")).toEqual([2]);
    expect(rbObjIvarGet(o, "@foo_bar")).toBe(1);
    expect(rbObjIvarGet(o, "@missing")).toBeNull();
    expect(rbObjIvarGet(new SubHolder(), "@constructor")).toBeNull();
    rbObjIvarSet(o, "@é", 4);
    expect(rbObjIvarGet(o, "@é")).toBe(4);
    rbObjIvarSet(o, "@_cache_key", 3);
    expect(Object.hasOwn(o, "_cacheKey")).toBe(true);
    expect(rbObjInstanceVariables(o)).toContain("@_cache_key");
  });

  it("reports each field under a name that reads the same field back", () => {
    const o = Object.assign(new Holder(), { a_1: 5, HTTP: 6, fooBAR: 7 });
    expect(rbObjInstanceVariables(o)).toEqual([
      "@foo_bar",
      "@items",
      "@a_1",
      "@HTTP",
      "@foo_b_a_r",
    ]);
    expect([
      rbObjIvarGet(o, "@a_1"),
      rbObjIvarGet(o, "@HTTP"),
      rbObjIvarGet(o, "@foo_b_a_r"),
    ]).toEqual([5, 6, 7]);
  });

  it("raises FrozenError on a frozen receiver", () => {
    expect(() => rbObjIvarSet(Object.freeze(new Holder()), "@items", [])).toThrow(FrozenError);
  });

  it("raises NameError for a name that is not an ivar name", () => {
    expect(() => rbObjIvarGet(new Holder(), "foo")).toThrow(NameError);
    expect(() => rbObjIvarGet(new Holder(), "@1a")).toThrow(NameError);
    expect(() => rbObjIvarSet(new Holder(), "foo", 1)).toThrow(
      "`foo' is not allowed as an instance variable name",
    );
  });
});

describe("Class#superclass", () => {
  it("skips the link an extended Module puts above the class", () => {
    class Parent {}
    class Child extends Parent {}
    const mod = new Module((m) => {
      m.defineMethod("greet", function () {
        return "hi";
      });
    });
    mod.extendObject(Child);

    expect(Object.getPrototypeOf(Child)).not.toBe(Parent);
    expect(rbClassSuperclass(Child)).toBe(Parent);
  });

  it("answers the parent of a class nothing was extended onto, and null at the root", () => {
    class Parent {}
    class Child extends Parent {}

    expect(rbClassSuperclass(Child)).toBe(Parent);
    expect(rbClassSuperclass(Parent)).toBeNull();
  });
});

describe("Module#name", () => {
  const Outer = { name: "Outer::Space" };
  class Base {}
  class Derived extends Base {}
  class Nested {}
  rbSetClassPathString(Base, Outer, "Base");
  rbSetClassPathString(Nested, Base, "Nested");

  it("is the path rb_set_class_path_string gave the class under its cbase", () => {
    expect(rbModName(Base)).toBe("Outer::Space::Base");
    expect(rbModName(Nested)).toBe("Outer::Space::Base::Nested");
    expect(rbModToS(Base)).toBe("Outer::Space::Base");
  });

  it("is the class's own name while unpathed, and nil for an anonymous class", () => {
    expect(rbModName(Derived)).toBe("Derived");
    expect(rbModName(class {})).toBeNull();
    expect(rbModName(class extends Base {})).toBeNull();
  });

  it("is what rb_obj_class reports for an instance", () => {
    expect(rbObjClassname(new Base())).toBe("Outer::Space::Base");
    expect(rbObjClassname(new Derived())).toBe("Derived");
    expect(rbObjClassname(Derived)).toBe("Class");
    expect(rbObjClassname(() => {})).toBe("Proc");
    expect(rbObjClassname(new (class extends Base {})())).toMatch(/^#<Class:0x[0-9a-f]+>$/);
  });
});

describe("rb_obj_class over trails' date and hash seats", () => {
  const tagged = (tag: string) => ({ [Symbol.toStringTag]: tag });

  it("answers Date, DateTime and Time for the Temporal plain shapes and a JS Date", () => {
    expect(rbObjClassname(tagged("Temporal.PlainDate"))).toBe("Date");
    expect(rbObjClassname(tagged("Temporal.PlainDateTime"))).toBe("DateTime");
    expect(rbObjClassname(tagged("Temporal.PlainTime"))).toBe("Time");
    expect(rbObjClassname(new Date(0))).toBe("Time");
    expect(rbObjClassname(new (class Stamp extends Date {})(0))).toBe("Stamp");
  });

  it("orders two PlainTimes by their own compare, not on an instant they do not carry", () => {
    class PlainTime {
      readonly [Symbol.toStringTag] = "Temporal.PlainTime";
      constructor(readonly hour: number) {}
      static compare(l: PlainTime, r: PlainTime): number {
        return Math.sign(l.hour - r.hour);
      }
    }
    expect(cmp(new PlainTime(1), new PlainTime(2))).toBe(-1);
  });

  it("answers Hash for a record whose prototype chain holds no class", () => {
    class Klass {}
    expect(rbObjClassname(Object.create({ inherited: "x" }))).toBe("Hash");
    expect(rbObjClassname(Object.create(Object.create(null)))).toBe("Hash");
    expect(rbObjClassname(Object.create({ constructor: Klass }))).toBe("Hash");
    expect(rbObjClassname(new Klass())).toBe("Klass");
  });
});

describe("isNil", () => {
  it("is true for both JS spellings of nil", () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
  });

  it("is false for a receiver with no nil? of its own", () => {
    expect(isNil(0)).toBe(false);
    expect(isNil("")).toBe(false);
    expect(isNil(false)).toBe(false);
    expect(isNil({})).toBe(false);
  });

  it("answers through the receiver's own nil?", () => {
    expect(isNil({ isNil: () => true })).toBe(true);
    expect(isNil({ isNil: () => false })).toBe(false);
  });
});

describe("toS", () => {
  it("answers a Symbol's name and any other receiver's to_s", () => {
    expect(toSSend(":name")).toBe("name");
    expect(toSSend("name")).toBe("name");
    expect(toSSend(1)).toBe("1");
    expect(toSSend(null)).toBe("");
  });
});

describe("toSym", () => {
  it("answers the Symbol spelling of a JS string, which spells both a String and a Symbol", () => {
    expect(toSym("posts")).toBe(":posts");
    expect(toSym(":posts")).toBe(":posts");
  });

  it("raises NoMethodError for a receiver that defines no to_sym", () => {
    expect(() => toSym(1)).toThrow(NoMethodError);
    expect(() => toSym(1)).toThrow("undefined method 'to_sym' for an instance of Integer");
    expect(() => toSym(null)).toThrow("undefined method 'to_sym' for nil");
  });
});

describe("Exception#inspect", () => {
  class Loud extends Error {}

  it("answers the class name for an empty message", () => {
    expect(inspect(new Loud(""))).toBe("Loud");
  });

  it("wraps the class name and message", () => {
    expect(inspect(new Loud("Something made the bad noise."))).toBe(
      "#<Loud: Something made the bad noise.>",
    );
  });

  it("inspects a message carrying a newline", () => {
    expect(inspect(new Loud("a\nb"))).toBe('#<Loud:"a\\nb">');
  });

  it("names a namespaced class by its path", () => {
    class Outer {}
    class Inner extends Error {}
    rbModConstSet(Outer, "Inner", Inner);
    expect(inspect(new Inner("boom"))).toBe("#<Outer::Inner: boom>");
  });
});
