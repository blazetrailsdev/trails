import { describe, it, expect } from "vitest";
import { JSON as JSONHost } from "./json.js";
import { Model } from "../index.js";

// Mirrors ActiveModel::Serializers::JSON (json.rb). Pinning the host
// surface here so the mixin shape (model_name + serializable_hash +
// as_json + from_json) doesn't regress.
//
// Rails' `read_attribute_for_serialization` is `alias :… :send`, so a host
// must expose a per-key reader for every attribute name (`attr_accessor`
// parity) — the `attributes` hash only names the keys, it is not a value
// fallback. These test models therefore define per-key getters alongside the
// `attributes` reader, and the `attributes=` alias `from_json` writes through
// (json.rb:147) as `setAttributes` (attribute_assignment.rb:36).
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

    /**
     * The host `def attributes=(hash)` Rails' `from_json` docstring defines
     * (json.rb:120-126); trails spells the `attributes=` alias
     * `setAttributes` (attribute_assignment.rb:36).
     */
    setAttributes(this: { _name: string; _age: number }, h: { name: string; age: number }) {
      this._name = h.name;
      this._age = h.age;
    }
    _name = "";
    _age = 0;
    setAttributes(h: { name: string; age: number }) {
      this._name = h.name;
      this._age = h.age;
    }
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

      /**
       * The host `def attributes=(hash)` Rails' `from_json` docstring defines
       * (json.rb:120-126); trails spells the `attributes=` alias
       * `setAttributes` (attribute_assignment.rb:36).
       */
      setAttributes(this: { _x: number }, h: { x: number }) {
        this._x = h.x;
      }
      _x = 0;
      setAttributes(h: { x: number }) {
        this._x = h.x;
      }
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

      /**
       * The host `def attributes=(hash)` Rails' `from_json` docstring defines
       * (json.rb:120-126); trails spells the `attributes=` alias
       * `setAttributes` (attribute_assignment.rb:36).
       */
      setAttributes(this: { _id: bigint }, h: { id: bigint }) {
        this._id = h.id;
      }
      _id = 0n;
      setAttributes(h: { id: bigint }) {
        this._id = h.id;
      }
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

      /**
       * The host `def attributes=(hash)` Rails' `from_json` docstring defines
       * (json.rb:120-126); trails spells the `attributes=` alias
       * `setAttributes` (attribute_assignment.rb:36).
       */
      setAttributes(this: { _name: string }, h: { name: string }) {
        this._name = h.name;
      }
      _name = "";
      setAttributes(h: { name: string }) {
        this._name = h.name;
      }
      get name() {
        return this._name;
      }
    }
    const c = new CustomRooted();
    c._name = "Eve";
    expect(c.asJson()).toMatchObject({ author: { name: "Eve" } });
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
          configurable: true,
        });
      }

      /**
       * The host `def attributes=(hash)` Rails' `from_json` docstring defines
       * (json.rb:120-126); trails spells the `attributes=` alias
       * `setAttributes` (attribute_assignment.rb:36).
       */
      setAttributes(this: { _v: number }, h: { v: number }) {
        this._v = h.v;
      }
      _v = 0;
      setAttributes(h: { v: number }) {
        this._v = h.v;
      }
      get v() {
        return this._v;
      }
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
          configurable: true,
        });
      }

      /**
       * The host `def attributes=(hash)` Rails' `from_json` docstring defines
       * (json.rb:120-126); trails spells the `attributes=` alias
       * `setAttributes` (attribute_assignment.rb:36).
       */
      setAttributes(this: { _v: number }, h: { v: number }) {
        this._v = h.v;
      }
      _v = 0;
      setAttributes(h: { v: number }) {
        this._v = h.v;
      }
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
    // Ruby: `if root` is true for "", and `root == true` is false, so
    // Rails wraps under the empty key.
    expect(p.asJson({ root: "" })).toMatchObject({ "": { name: "Hank", age: 70 } });
  });

  it("Model already implements the same surface ergonomically", () => {
    expect(typeof Model.prototype.asJson).toBe("function");
  });
});
