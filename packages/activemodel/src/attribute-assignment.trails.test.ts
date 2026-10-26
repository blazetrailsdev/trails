/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { NoMethodError, isEmpty } from "@blazetrails/ruby-compat";
import { UnknownAttributeError } from "./errors.js";
import { Model } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { AttributeMethods } from "./attribute-methods.js";
import { include, removePossibleMethod } from "@blazetrails/activesupport";

class ProtectedParams {
  private parameters: Record<string, unknown>;
  private _permitted = false;

  constructor(attributes: Record<string, unknown>) {
    this.parameters = attributes;
  }

  isPermitted(): boolean {
    return this._permitted;
  }

  permitBang(): this {
    this._permitted = true;
    return this;
  }

  isEmpty(): boolean {
    return isEmpty(this.parameters);
  }

  toH(): Record<string, unknown> {
    return this.parameters;
  }
}

describe("AttributeAssignmentTest", () => {
  it("finds inherited setter even when subclass defines a getter-only accessor", () => {
    class Base extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      set name(v: string) {
        (this as Base)._writeAttribute("name", v.toUpperCase());
      }
      get name(): string {
        return this.attribute("name") as string;
      }
    }
    interface Base extends Attributes {}

    class Child extends Base {
      override get name(): string {
        return super.name + "!";
      }
    }
    const c = new Child({});
    void c.assignAttributes({ name: "bob" });
    expect(c.attribute("name")).toBe("BOB");
  });

  it("routes through instance-own setter (JS singleton method)", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    const seen: string[] = [];
    Object.defineProperty(p, "name", {
      set(v: string) {
        seen.push(v);
        (this as Person)._writeAttribute("name", v.toUpperCase());
      },
      configurable: true,
    });
    void p.assignAttributes({ name: "bob" });
    expect(seen).toEqual(["bob"]);
    expect(p.attribute("name")).toBe("BOB");
  });

  it("routes through user-defined setter if present", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      set name(v: string) {
        this._writeAttribute("name", v.trim().toUpperCase());
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    void p.assignAttributes({ name: "  bob  " });
    expect(p.attribute("name")).toBe("BOB");
  });

  it("subclass override of _assignAttributes is called by assignAttributes", () => {
    const called: Record<string, unknown>[] = [];
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      override _assignAttributes(attrs: Record<string, unknown>): void {
        called.push(attrs);
        void super._assignAttributes(attrs);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    void p.assignAttributes({ name: "Carol" });
    expect(called).toHaveLength(1);
    expect(called[0]).toEqual({ name: "Carol" });
    expect(p._readAttribute("name")).toBe("Carol");
  });

  it("subclass override of sanitizeForMassAssignment is called by assignAttributes", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("role", "string");
      }
      override sanitizeForMassAssignment(attrs: Record<string, unknown>): Record<string, unknown> {
        const { role: _role, ...rest } = attrs;
        return rest;
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    void p.assignAttributes({ name: "Dave", role: "admin" });
    expect(p._readAttribute("name")).toBe("Dave");
    expect(p._readAttribute("role")).toBeNull();
  });

  it("empty params wrapper is a no-op on assignAttributes (empty? delegation)", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    const params = new ProtectedParams({});
    expect(() => p.assignAttributes(params as unknown as Record<string, unknown>)).not.toThrow();
    expect(p._readAttribute("name")).toBeNull();
  });

  it("empty params wrapper is a no-op at construction (empty? delegation)", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const params = new ProtectedParams({});
    let record: Person | undefined;
    expect(() => {
      record = new Person(params as unknown as Record<string, unknown>);
    }).not.toThrow();
    expect(record!._readAttribute("name")).toBeNull();
  });

  it("non-empty unpermitted params wrapper still raises (empty? delegation)", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    const params = new ProtectedParams({ name: "Bob" });
    expect(() => p.assignAttributes(params as unknown as Record<string, unknown>)).toThrow(
      ForbiddenAttributesError,
    );
  });

  it("subclass override of _assignAttribute is called by _assignAttributes", () => {
    const seen: Array<[string, unknown]> = [];
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
      override _assignAttribute(k: string, v: unknown): unknown {
        seen.push([k, v]);
        return super._assignAttribute(k, v);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    void p.assignAttributes({ name: "Eve", age: 5 });
    expect(seen).toContainEqual(["name", "Eve"]);
    expect(seen).toContainEqual(["age", 5]);
    expect(p._readAttribute("name")).toBe("Eve");
  });

  it("assigns through an accessor setter defined on an ancestor prototype", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}
    class Admin extends Person {}
    class SuperAdmin extends Admin {}

    const p = new SuperAdmin({});
    void p.assignAttributes({ name: "bob" });
    expect(p.attribute("name")).toBe("bob");
  });

  it("raises UnknownAttributeError for a getter-only property", () => {
    class Person extends Model {
      get nickname(): string {
        return "n";
      }
    }
    const p = new Person({});
    expect(() => p.assignAttributes({ nickname: "bob" })).toThrow(UnknownAttributeError);
  });

  it("prefers a nearer setX writer over an ancestor accessor setter", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}
    const seen: unknown[] = [];
    class Admin extends Person {
      setName(v: string): void {
        seen.push(v);
      }
    }

    const p = new Admin({});
    void p.assignAttributes({ name: "bob" });
    expect(seen).toEqual(["bob"]);
    expect(p.attribute("name")).toBeNull();
  });

  it("re-raises a NoMethodError raised inside a defined setter", () => {
    class Person extends Model {
      set name(_v: string) {
        throw new NoMethodError("undefined method 'boom'");
      }
    }
    const p = new Person({});
    expect(() => p.assignAttributes({ name: "bob" })).toThrow(NoMethodError);
  });

  describe("writer resolution cache", () => {
    class Proxied extends Model {
      declare static attributeMethodSuffix: (...suffixes: string[]) => void;
      declare static defineAttributeMethods: (...names: string[]) => void;
      declare static undefineAttributeMethods: () => void;
      declare static generatedAttributeMethods: () => { prototype: object };
      written: [string, unknown][] = [];

      static {
        include(this, AttributeMethods);
        this.attributeMethodSuffix("=");
      }

      "attribute="(name: string, value: unknown): void {
        this.written.push([name, value]);
      }
    }

    it("sees attribute methods defined after the first assignment", () => {
      class Person extends Proxied {}
      const p = new Person();
      expect(() => p.assignAttributes({ foo: 1 })).toThrow(UnknownAttributeError);
      Person.defineAttributeMethods("foo");
      p.assignAttributes({ foo: 2 });
      expect(p.written).toEqual([["foo", 2]]);
    });

    it("sees attribute methods undefined after the first assignment", () => {
      class Person extends Proxied {}
      Person.defineAttributeMethods("foo");
      const p = new Person();
      p.assignAttributes({ foo: 1 });
      expect(p.written).toEqual([["foo", 1]]);
      Person.undefineAttributeMethods();
      expect(() => p.assignAttributes({ foo: 2 })).toThrow(UnknownAttributeError);
      expect(p.written).toEqual([["foo", 1]]);
    });

    it("sees a writer removed after the first assignment", () => {
      class Person extends Proxied {}
      Person.defineAttributeMethods("foo");
      const p = new Person();
      p.assignAttributes({ foo: 1 });
      removePossibleMethod.call(Person.generatedAttributeMethods(), "foo=");
      expect(() => p.assignAttributes({ foo: 2 })).toThrow(UnknownAttributeError);
      class Plain extends Model {
        "bar="(_: unknown): void {}
      }
      const q = new Plain();
      q.assignAttributes({ bar: 1 });
      removePossibleMethod.call(Plain, "bar=");
      expect(() => q.assignAttributes({ bar: 2 })).toThrow(UnknownAttributeError);
    });

    it("an instance-own setK writer outranks a prototype k= writer", () => {
      class Person extends Proxied {}
      Person.defineAttributeMethods("foo");
      const p = new Person();
      p.assignAttributes({ foo: 1 });
      const q = new Person() as Person & { setFoo?: (v: unknown) => void };
      const seen: unknown[] = [];
      q.setFoo = (v) => seen.push(v);
      q.assignAttributes({ foo: 2 });
      expect(seen).toEqual([2]);
      expect(q.written).toEqual([]);
    });

    it("sees an attribute declared after the first assignment", () => {
      class Person extends Model {
        declare static attribute: AttributesClassHalf["attribute"];

        static {
          include(this, Attributes);
          this.attribute("name", "string");
        }
      }
      interface Person extends Attributes {}
      const p = new Person();
      p.assignAttributes({ name: "a" });
      expect(() => p.assignAttributes({ age: "3" })).toThrow(UnknownAttributeError);
      Person.attribute("age", "integer");
      const q = new Person();
      q.assignAttributes({ age: "3" });
      expect(q.attribute("age")).toBe(3);
    });
  });
});
