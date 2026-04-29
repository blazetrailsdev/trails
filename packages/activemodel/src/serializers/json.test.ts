import { describe, it, expect } from "vitest";
import { JSON as JSONHost } from "./json.js";
import { Model } from "../index.js";

// Mirrors ActiveModel::Serializers::JSON (json.rb). Pinning the host
// surface here so the mixin shape (model_name + serializable_hash +
// as_json + from_json) doesn't regress.
describe("Serializers::JSON host", () => {
  class Person extends JSONHost {
    static {
      Object.defineProperty(this.prototype, "attributes", {
        get() {
          return { name: this._name, age: this._age };
        },
        set(this: { _name: string; _age: number }, h: { name: string; age: number }) {
          this._name = h.name;
          this._age = h.age;
        },
        configurable: true,
      });
    }
    _name = "";
    _age = 0;
  }

  it("modelName resolves to the subclass and is memoized per-class", () => {
    expect(Person.modelName.name).toBe("Person");
    // Memoized — repeat call returns same instance.
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
          set(this: { _x: number }, h: { x: number }) {
            this._x = h.x;
          },
          configurable: true,
        });
      }
      _x = 0;
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
          set(this: { _id: bigint }, h: { id: bigint }) {
            this._id = h.id;
          },
          configurable: true,
        });
      }
      _id = 0n;
    }
    const b = new Big();
    b._id = 9007199254740993n;
    // Without coerceForJson, JSON.stringify(b.asJson()) would throw.
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
          set(this: { _name: string }, h: { name: string }) {
            this._name = h.name;
          },
          configurable: true,
        });
      }
      _name = "";
    }
    const c = new CustomRooted();
    c._name = "Eve";
    expect(c.asJson()).toMatchObject({ author: { name: "Eve" } });
  });

  it("fromJson rejects non-object JSON with shape-accurate diagnostics", () => {
    expect(() => new Person().fromJson("42")).toThrow(/got number/);
    expect(() => new Person().fromJson("[1,2,3]")).toThrow(/got array/);
    expect(() => new Person().fromJson("null")).toThrow(/got null/);
  });

  it("fromJson always unwraps via first-value semantics (Rails hash.values.first)", () => {
    // Rails json.rb:147 — `hash = hash.values.first if include_root`,
    // ignoring the configured root key. Pin that behavior explicitly so
    // the read path stays Rails-faithful even when includeRootInJson is
    // a string.
    class Keyed extends JSONHost {
      static {
        this.includeRootInJson = "data";
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { v: this._v };
          },
          set(this: { _v: number }, h: { v: number }) {
            this._v = h.v;
          },
          configurable: true,
        });
      }
      _v = 0;
    }
    const k = new Keyed().fromJson('{"payload":{"v":7},"data":{"v":1}}');
    expect(k._v).toBe(7);
  });

  it("fromJson uses class-level includeRootInJson default when no second arg passed", () => {
    class Defaulted extends JSONHost {
      static {
        this.includeRootInJson = true;
        Object.defineProperty(this.prototype, "attributes", {
          get() {
            return { v: this._v };
          },
          set(this: { _v: number }, h: { v: number }) {
            this._v = h.v;
          },
          configurable: true,
        });
      }
      _v = 0;
    }
    const d = new Defaulted().fromJson('{"defaulted":{"v":99}}');
    expect(d._v).toBe(99);
  });

  it("toJson returns a JSON string (matches Model#toJson)", () => {
    const p = new Person();
    p._name = "Grace";
    p._age = 60;
    const s = p.toJson();
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
    // Ruby: `if root` is true for "", and `root == true` is false, so
    // Rails wraps under the empty key.
    expect(p.asJson({ root: "" })).toMatchObject({ "": { name: "Hank", age: 70 } });
  });

  it("Model already implements the same surface ergonomically", () => {
    // Sanity: the JSON host is the canonical mixin form; Model continues
    // to compose asJson/fromJson directly (model.ts already mirrors json.rb).
    expect(typeof Model.prototype.asJson).toBe("function");
  });
});
