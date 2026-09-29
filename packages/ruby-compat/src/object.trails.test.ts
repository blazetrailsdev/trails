import { describe, it, expect } from "vitest";
import {
  basicObjRespondTo,
  rbInspect as inspect,
  rbObjInspect,
  rbObjId,
  rbObjAsString as toS,
  rbObjRespondTo,
  rbFPublicSend,
  rbFSend,
  rbModPrivate,
  rbModPublicMethodDefined,
} from "./object.js";
import { NoMethodError } from "./no-method-error.js";

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
    // vendor/ruby/v3.3.11/vm_method.c:2882 vm_respond_to, :2945 the basic_obj_respond_to fallback.
    const overriding = { isRespondTo: (mid: string) => mid === "name" };
    expect(rbObjRespondTo(overriding, "name")).toBe(true);
    expect(rbObjRespondTo(overriding, "respondTo")).toBe(false);
    expect(rbObjRespondTo({ id: 1 }, "id")).toBe(true);
  });

  it("answers to_str for a String, which String.prototype does not define", () => {
    // vendor/ruby/v3.3.11/string.c:12177 rb_define_method(rb_cString, "to_str", rb_str_to_s, 0).
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

class Req {
  field = "f";
  get host(): string {
    return "example.org";
  }
  subdomain(): string {
    return "clients";
  }
  secret(): string {
    return "s";
  }
}
rbModPrivate(Req, "secret");

describe("rbFSend", () => {
  it("calls a method, a getter, or reads a field by name", () => {
    const req = new Req();
    expect(rbFSend(req, "subdomain")).toBe("clients");
    expect(rbFSend(req, "host")).toBe("example.org");
    expect(rbFSend(req, "field")).toBe("f");
  });

  it("calls a private method where public_send raises", () => {
    const req = new Req();
    expect(rbFSend(req, "secret")).toBe("s");
    expect(() => rbFPublicSend(req, "secret")).toThrow(NoMethodError);
  });

  it("raises NoMethodError for an unbound name", () => {
    expect(() => rbFSend(new Req(), "nope")).toThrow(NoMethodError);
  });
});

describe("rbModPublicMethodDefined", () => {
  it("answers a public method or accessor, inherited or own", () => {
    class SubReq extends Req {}
    expect(rbModPublicMethodDefined(Req, "subdomain")).toBe(true);
    expect(rbModPublicMethodDefined(Req, "host")).toBe(true);
    expect(rbModPublicMethodDefined(SubReq, "subdomain")).toBe(true);
  });

  it("does not answer a private method, a field, an Object.prototype member, or an unknown name", () => {
    expect(rbModPublicMethodDefined(Req, "secret")).toBe(false);
    expect(rbModPublicMethodDefined(Req, "field")).toBe(false);
    expect(rbModPublicMethodDefined(Req, "hasOwnProperty")).toBe(false);
    expect(rbModPublicMethodDefined(Req, "nope")).toBe(false);
  });
});
