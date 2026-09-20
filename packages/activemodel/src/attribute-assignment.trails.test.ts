/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";
import { include } from "@blazetrails/activesupport";

class ProtectedParams {
  private parameters: Record<string, unknown>;
  private _permitted = false;

  constructor(attributes: Record<string, unknown>) {
    this.parameters = attributes;
  }

  permitted(): boolean {
    return this._permitted;
  }

  permitBang(): this {
    this._permitted = true;
    return this;
  }

  get empty(): boolean {
    return Object.keys(this.parameters).length === 0;
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
      override _assignAttribute(k: string, v: unknown): Promise<void> | void {
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
});
