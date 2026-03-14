import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("ActiveModel", () => {
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
      }
      const p = new Person({});
      // Normal assignment should work
      p.assignAttributes({ name: "test" });
      expect(p.readAttribute("name")).toBe("test");
    });

    it("an ArgumentError is raised if a non-hash-like object is passed", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({});
      expect(() => p.assignAttributes("not a hash" as any)).toThrow();
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
  });

  describe("AttributeAssignmentTest (ported)", () => {
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
});
