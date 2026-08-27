import { describe, it, expect } from "vitest";
import { Base } from "./base.js";

/** ActiveModel's `attribute_names` — `attribute_types.keys`
 * (activemodel attributes.rb:74-76). ActiveRecord's override gates on
 * `table_exists?` (attribute_methods.rb:236-241) and would answer `[]` for
 * these adapter-less classes, so the AM spelling is the one that reads them. */
const attributeNamesOf = (klass: unknown): string[] =>
  Object.keys((klass as { attributeTypes(): Record<string, unknown> }).attributeTypes());

describe("STI subclass attribute() registration", () => {
  it("keeps subclass attribute() calls on the subclass, not the STI base", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {
      static {
        this.attribute("radius", "integer");
      }
    }

    expect(attributeNamesOf(Circle)).toContain("radius");
    expect(attributeNamesOf(Shape)).not.toContain("radius");

    expect(Object.hasOwn(Circle, "_pendingAttributeModifications")).toBe(true);
  });

  it("still forks the STI base itself (non-subclass) on attribute() — unchanged", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("name", "string");
      }
    }

    // Shape IS the STI base (not a subclass), so its map is its own.
    expect(Object.hasOwn(Shape, "_pendingAttributeModifications")).toBe(true);
    expect(attributeNamesOf(Shape)).toContain("name");
  });

  it("non-STI classes are unaffected", () => {
    class Widget extends Base {
      static {
        this.attribute("price", "integer");
      }
    }

    expect(Object.hasOwn(Widget, "_pendingAttributeModifications")).toBe(true);
    expect(attributeNamesOf(Widget)).toContain("price");
  });

  it("STI subclass attribute declared AFTER base inherits the base's attrs too", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("name", "string");
      }
    }
    class Triangle extends Shape {
      static {
        this.attribute("sides", "integer");
      }
    }

    expect(Triangle.typeForAttribute("name").name).toBe("string");
    expect(Triangle.typeForAttribute("sides").name).toBe("integer");
    expect(attributeNamesOf(Shape)).not.toContain("sides");
  });

  it("STI subclass encrypts() stays on the subclass, unlike attribute()", async () => {
    const { isEncryptedAttribute } = await import("./encryption.js");

    class Animal extends Base {
      static override tableName = "animals";
      static {
        this.inheritanceColumn = "type";
        this.attribute("name", "string");
      }
    }
    class Dog extends Animal {
      static {
        this.encrypts("name");
      }
    }
    class Cat extends Animal {}

    // `encrypts` is per-class in Rails: `encrypted_attributes` is a
    // `class_attribute` and `encrypt_attribute` calls `decorate_attributes` on
    // the receiver, while `_default_attributes` replays the superclass's
    // modifications first and then only the class's OWN pending decorators
    // (encryption/encryptable_record.rb, activemodel attribute_registration.rb).
    expect(Object.prototype.hasOwnProperty.call(Dog, "_pendingEncryptions")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(Animal, "_pendingEncryptions")).toBe(false);

    // The declaring subclass encrypts; the base and its siblings do not.
    expect(isEncryptedAttribute(Dog, "name")).toBe(true);
    expect(isEncryptedAttribute(Animal, "name")).toBe(false);
    expect(isEncryptedAttribute(Cat, "name")).toBe(false);
  });

  it("subclass attribute survives the subclass's own schema reflection (end-to-end)", async () => {
    const { loadSchemaFromAdapter } = await import("./model-schema.js");
    const { ValueType } = await import("@blazetrails/activemodel");

    class UuidT extends ValueType {
      override readonly name = "uuid" as unknown as "value";
    }

    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {
      static {
        this.attribute("radius", "integer");
      }
    }

    const adapter = {
      internalSchemaCache: {
        dataSourceExists: async () => true,
        columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
        getCachedColumnsHash: () => ({ guid: { sqlType: "uuid" } }),
        isCached: () => true,
      },
      lookupCastTypeFromColumn(col: { sqlType: string }) {
        return col.sqlType === "uuid" ? new UuidT() : null;
      },
    };
    (Shape as unknown as { adapter: unknown }).adapter = adapter;

    await (loadSchemaFromAdapter as unknown as (this: typeof Base) => Promise<void>).call(Shape);
    await (loadSchemaFromAdapter as unknown as (this: typeof Base) => Promise<void>).call(Circle);

    expect(Shape.typeForAttribute("guid").name).toBe("uuid");
    expect(attributeNamesOf(Shape)).not.toContain("radius");
    expect(Object.hasOwn(Circle, "_pendingAttributeModifications")).toBe(true);
    expect(Circle.typeForAttribute("radius").name).toBe("integer");
    expect(Circle.typeForAttribute("guid").name).toBe("uuid");
  });
  it("own-table descendant under an STI ancestor keeps attribute() on itself", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {
      static {
        this.attribute("radius", "integer");
      }
    }
    // Rails' own-table descendant: a class under an STI ancestor that names its
    // own table owns an independent schema, so its declarations must not land
    // on the STI base (or leak to shared-table siblings).
    class Ticket extends Circle {
      static override tableName = "tickets";
      static {
        this.attribute("priority", "integer");
      }
    }

    expect(Object.hasOwn(Ticket, "_pendingAttributeModifications")).toBe(true);
    expect(Ticket.typeForAttribute("priority").name).toBe("integer");
    expect(attributeNamesOf(Shape)).not.toContain("priority");
    expect(attributeNamesOf(Circle)).not.toContain("priority");

    expect(Object.hasOwn(Circle, "_pendingAttributeModifications")).toBe(true);
    expect(attributeNamesOf(Shape)).not.toContain("radius");
    expect(Circle.typeForAttribute("radius").name).toBe("integer");

    // Inherited (shared-ancestor) declarations remain visible on the descendant.
    expect(Ticket.typeForAttribute("radius").name).toBe("integer");
  });
  it("own-table descendant does not clobber the STI base's attributesBuilder cache", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("radius", "integer");
      }
    }
    class Ticket extends Shape {
      static override tableName = "tickets";
      static {
        this.attribute("priority", "integer");
      }
    }

    const shapeBuilder = Shape.attributesBuilder();
    const ticketBuilder = Ticket.attributesBuilder();

    expect(ticketBuilder).not.toBe(shapeBuilder);
    expect(Shape.attributesBuilder()).toBe(shapeBuilder);
    expect(Object.prototype.hasOwnProperty.call(Ticket, "_attributesBuilder")).toBe(true);
  });
});
