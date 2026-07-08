import { describe, it, expect } from "vitest";
import { Model, ArgumentError } from "./index.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";

// Mirrors Rails' ProtectedParams stub (attribute_assignment_test.rb): a
// params-like wrapper exposing `permitted?` and `to_h`. Trails dispatches on
// the camelCase `permitted` / `toH` members.
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

  toH(): Record<string, unknown> {
    return this.parameters;
  }
}

describe("AttributeAssignmentTest", () => {
  it("simple assignment alias", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Bob" });
    expect(p.readAttribute("name")).toBe("Bob");
  });

  it("assign non-existing attribute", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    // Rails raises UnknownAttributeError for a key with no setter / column.
    let raised: unknown;
    try {
      p.assignAttributes({ unknown_attr: "value" });
    } catch (e) {
      raised = e;
    }
    expect((raised as Error)?.name).toBe("UnknownAttributeError");
    expect((raised as { attribute?: string })?.attribute).toBe("unknown_attr");
  });

  it("assign non-existing attribute by overriding #attribute_writer_missing", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      _customAttrs: Record<string, unknown> = {};
      writeAttribute(name: string, value: unknown): void {
        if (!(this.constructor as typeof Model)._attributeDefinitions.has(name)) {
          this._customAttrs[name] = value;
        } else {
          super.writeAttribute(name, value);
        }
      }
    }
    const p = new Person({});
    p.assignAttributes({ unknown_field: "hello" });
    expect(p._customAttrs["unknown_field"]).toBe("hello");
  });

  it("assign private attribute", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "private_val" });
    expect(p.readAttribute("name")).toBe("private_val");
  });

  it("does not swallow errors raised in an attribute writer", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      set name(_v: string) {
        throw new globalThis.Error("boom");
      }
    }
    const p = new Person({});
    expect(() => p.assignAttributes({ name: "test" })).toThrow("boom");
  });

  it("finds inherited setter even when subclass defines a getter-only accessor", () => {
    class Base extends Model {
      static {
        this.attribute("name", "string");
      }
      set name(v: string) {
        (this as Base).writeAttribute("name", v.toUpperCase());
      }
      // getter mirrors the default attribute read
      get name(): string {
        return this.readAttribute("name") as string;
      }
    }
    class Child extends Base {
      // shadow with getter-only — Rails' `public_send("name=", v)` would still
      // dispatch to Base#name=; our walk must too.
      override get name(): string {
        return super.name + "!";
      }
    }
    const c = new Child({});
    c.assignAttributes({ name: "bob" });
    expect(c.readAttribute("name")).toBe("BOB");
  });

  it("routes through instance-own setter (JS singleton method)", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    const seen: string[] = [];
    Object.defineProperty(p, "name", {
      set(v: string) {
        seen.push(v);
        (this as Person).writeAttribute("name", v.toUpperCase());
      },
      configurable: true,
    });
    p.assignAttributes({ name: "bob" });
    expect(seen).toEqual(["bob"]);
    expect(p.readAttribute("name")).toBe("BOB");
  });

  it("routes through user-defined setter if present", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      set name(v: string) {
        super.writeAttribute("name", v.trim().toUpperCase());
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "  bob  " });
    expect(p.readAttribute("name")).toBe("BOB");
  });

  it("an ArgumentError is raised if a non-hash-like object is passed", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(() => p.assignAttributes("not a hash" as any)).toThrow(ArgumentError);
    expect(() => p.assignAttributes(null as any)).toThrow(ArgumentError);
    expect(() => p.assignAttributes([] as any)).toThrow(ArgumentError);
    expect(() => p.assignAttributes(new Date() as any)).toThrow(
      "When assigning attributes, you must pass a hash as an argument, Date passed.",
    );
  });

  it("forbidden attributes cannot be used for mass assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("description", "string");
      }
    }
    const params = new ProtectedParams({ name: "Guille", description: "m" });
    expect(() => new Person(params as unknown as Record<string, unknown>)).toThrow(
      ForbiddenAttributesError,
    );
  });

  it("permitted attributes can be used for mass assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("description", "string");
      }
    }
    const params = new ProtectedParams({ name: "Guille", description: "desc" }).permitBang();
    const p = new Person(params as unknown as Record<string, unknown>);
    expect(p.readAttribute("name")).toBe("Guille");
    expect(p.readAttribute("description")).toBe("desc");
  });

  it("assigning no attributes should not raise, even if the hash is un-permitted", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    expect(() => p.assignAttributes({})).not.toThrow();
  });

  it("passing an object with each_pair but without each", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
  });

  it("simple assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Alice", age: 30 });
    expect(p.readAttribute("name")).toBe("Alice");
    expect(p.readAttribute("age")).toBe(30);
  });

  it("regular hash should still be used for mass assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Bob" });
    expect(p.readAttribute("name")).toBe("Bob");
  });

  it("subclass override of _assignAttributes is called by assignAttributes", () => {
    const called: Record<string, unknown>[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      override _assignAttributes(attrs: Record<string, unknown>): void {
        called.push(attrs);
        super._assignAttributes(attrs);
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Carol" });
    expect(called).toHaveLength(1);
    expect(called[0]).toEqual({ name: "Carol" });
    expect(p.readAttribute("name")).toBe("Carol");
  });

  it("subclass override of sanitizeForMassAssignment is called by assignAttributes", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("role", "string");
      }
      override sanitizeForMassAssignment(attrs: Record<string, unknown>): Record<string, unknown> {
        const { role: _role, ...rest } = attrs;
        return rest;
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Dave", role: "admin" });
    expect(p.readAttribute("name")).toBe("Dave");
    expect(p.readAttribute("role")).toBeNull();
  });

  it("subclass override of _assignAttribute is called by _assignAttributes", () => {
    const seen: Array<[string, unknown]> = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
      override _assignAttribute(k: string, v: unknown): void {
        seen.push([k, v]);
        super._assignAttribute(k, v);
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "Eve", age: 5 });
    expect(seen).toContainEqual(["name", "Eve"]);
    expect(seen).toContainEqual(["age", 5]);
    expect(p.readAttribute("name")).toBe("Eve");
  });
});
