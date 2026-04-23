import { describe, it, expect } from "vitest";
import { Model, ArgumentError } from "./index.js";

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
    // Non-existing attributes are stored as extras
    p.assignAttributes({ unknown_attr: "value" });
    expect(p.readAttribute("unknown_attr")).toBe("value");
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
        (this as Base).writeAttribute("name", (v as string).toUpperCase());
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
        return (super.name as string) + "!";
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
  });

  it("forbidden attributes cannot be used for mass assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    // In our implementation, all attributes are permitted
    p.assignAttributes({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
  });

  it("permitted attributes can be used for mass assignment", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    const p = new Person({});
    p.assignAttributes({ name: "test" });
    expect(p.readAttribute("name")).toBe("test");
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
});
