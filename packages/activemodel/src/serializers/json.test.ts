import { describe, it, expect } from "vitest";
import { JSON as JSONHost } from "./json.js";

describe("Serializers::JSON host", () => {
  class Person extends JSONHost {
    static {
      Object.defineProperty(this.prototype, "attributes", {
        get() {
          return { name: this._name, age: this._age };
        },
        configurable: true,
      });
    }

    setAttributes(this: { _name: string; _age: number }, h: { name: string; age: number }) {
      this._name = h.name;
      this._age = h.age;
    }
    _name = "";
    _age = 0;
    get name() {
      return this._name;
    }
    get age() {
      return this._age;
    }
  }

  it("modelName resolves to the subclass and is memoized per-class", () => {
    expect(Person.modelName.name).toBe("Person");
    expect(Person.modelName).toBe(Person.modelName);

    class Other extends JSONHost {}
    expect(Other.modelName.name).toBe("Other");
    expect(Other.modelName).not.toBe(Person.modelName);
  });

  it("serializableHash delegates to serialization helper", () => {
    const p = new Person();
    p._name = "Bob";
    p._age = 22;
    const h = p.serializableHash();
    expect(h).toMatchObject({ name: "Bob", age: 22 });
  });

  it("asJson without root option returns the bare hash", () => {
    const p = new Person();
    p._name = "Bob";
    p._age = 22;
    expect(p.asJson()).toMatchObject({ name: "Bob", age: 22 });
  });

  it("asJson with root: true wraps under modelName.element", () => {
    const p = new Person();
    p._name = "Bob";
    p._age = 22;
    const wrapped = p.asJson({ root: true });
    expect(wrapped).toHaveProperty(Person.modelName.element);
  });

  it("asJson with root: 'custom' wraps under that key", () => {
    const p = new Person();
    p._name = "Bob";
    p._age = 22;
    expect(p.asJson({ root: "author" })).toMatchObject({ author: { name: "Bob", age: 22 } });
  });

  it("includeRootInJson default applies when no root option passed", () => {
    class Rooted extends JSONHost {
      static {
        this.includeRootInJson = true;
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { x: this._x };
          },
          configurable: true,
        });
      }

      setAttributes(this: { _x: number }, h: { x: number }) {
        this._x = h.x;
      }
      _x = 0;
      get x() {
        return this._x;
      }
    }
    const r = new Rooted();
    r._x = 1;
    expect(r.asJson()).toHaveProperty(Rooted.modelName.element);
  });

  it("fromJson round-trips through attributes setter", () => {
    const p = new Person().fromJson('{"name":"Carol","age":30}');
    expect(p._name).toBe("Carol");
    expect(p._age).toBe(30);
  });

  it("fromJson with includeRoot strips the wrapping key", () => {
    const p = new Person().fromJson('{"person":{"name":"Dan","age":40}}', true);
    expect(p._name).toBe("Dan");
    expect(p._age).toBe(40);
  });

  it("asJson coerces JSON-unsafe values (e.g. bigint)", () => {
    class Big extends JSONHost {
      static {
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { id: this._id };
          },
          configurable: true,
        });
      }

      setAttributes(this: { _id: bigint }, h: { id: bigint }) {
        this._id = h.id;
      }
      _id = 0n;
      get id() {
        return this._id;
      }
    }
    const b = new Big();
    b._id = 9007199254740993n;
    expect(() => globalThis.JSON.stringify(b.asJson())).not.toThrow();
  });

  it("includeRootInJson accepts a string custom root", () => {
    class CustomRooted extends JSONHost {
      static {
        this.includeRootInJson = "author";
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { name: this._name };
          },
          configurable: true,
        });
      }

      setAttributes(this: { _name: string }, h: { name: string }) {
        this._name = h.name;
      }
      _name = "";
      get name() {
        return this._name;
      }
    }
    const c = new CustomRooted();
    c._name = "Eve";
    expect(c.asJson()).toMatchObject({ author: { name: "Eve" } });
  });

  it("fromJson always unwraps via first-value semantics (Rails hash.values.first)", () => {
    class Keyed extends JSONHost {
      static {
        this.includeRootInJson = "data";
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { v: this._v };
          },
          configurable: true,
        });
      }

      setAttributes(this: { _v: number }, h: { v: number }) {
        this._v = h.v;
      }
      _v = 0;
      get v() {
        return this._v;
      }
    }
    const k = new Keyed().fromJson('{"payload":{"v":7},"data":{"v":1}}');
    expect(k._v).toBe(7);
  });

  it("fromJson treats an explicitly passed nil includeRoot as nil, not the class default", () => {
    class ExplicitNil extends JSONHost {
      static {
        this.includeRootInJson = true;
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { v: this._v };
          },
          configurable: true,
        });
      }
      _v = 0;
      setAttributes(h: { v: number }) {
        this._v = h.v;
      }
      get v() {
        return this._v;
      }
    }
    const e = new ExplicitNil().fromJson('{"v":7}', null);
    expect(e._v).toBe(7);
  });

  it("fromJson uses class-level includeRootInJson default when no second arg passed", () => {
    class Defaulted extends JSONHost {
      static {
        this.includeRootInJson = true;
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { v: this._v };
          },
          configurable: true,
        });
      }

      setAttributes(this: { _v: number }, h: { v: number }) {
        this._v = h.v;
      }
      _v = 0;
      get v() {
        return this._v;
      }
    }
    const d = new Defaulted().fromJson('{"defaulted":{"v":99}}');
    expect(d._v).toBe(99);
  });

  it("toJson returns a JSON string (matches Model#toJson)", () => {
    const p = new Person();
    p._name = "Grace";
    p._age = 60;
    const s = p.toJSON();
    expect(typeof s).toBe("string");
    expect(globalThis.JSON.parse(s)).toMatchObject({ name: "Grace", age: 60 });
  });

  it("toJSON delegates to asJson (used by JSON.stringify)", () => {
    const p = new Person();
    p._name = "Frank";
    p._age = 50;
    expect(globalThis.JSON.parse(globalThis.JSON.stringify(p))).toMatchObject({
      name: "Frank",
      age: 50,
    });
  });

  it("asJson treats empty-string root as truthy (Rails parity)", () => {
    const p = new Person();
    p._name = "Hank";
    p._age = 70;
    expect(p.asJson({ root: "" })).toMatchObject({ "": { name: "Hank", age: 70 } });
  });
});
