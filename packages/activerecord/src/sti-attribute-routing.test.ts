import { describe, it, expect } from "vitest";
import { Base } from "./base.js";

describe("STI subclass attribute() routing", () => {
  it("writes subclass attribute() calls to the STI base's _attributeDefinitions", () => {
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

    // Both classes see radius via the shared (base-owned) map.
    expect(Shape._attributeDefinitions.has("radius")).toBe(true);
    expect(Circle._attributeDefinitions.has("radius")).toBe(true);
    expect(Circle._attributeDefinitions).toBe(Shape._attributeDefinitions);

    // Circle didn't fork its own map.
    expect(Object.prototype.hasOwnProperty.call(Circle, "_attributeDefinitions")).toBe(false);
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
    expect(Object.prototype.hasOwnProperty.call(Shape, "_attributeDefinitions")).toBe(true);
    expect(Shape._attributeDefinitions.get("name")?.userProvided).toBe(true);
  });

  it("non-STI classes are unaffected", () => {
    class Widget extends Base {
      static {
        this.attribute("price", "integer");
      }
    }

    expect(Object.prototype.hasOwnProperty.call(Widget, "_attributeDefinitions")).toBe(true);
    expect(Widget._attributeDefinitions.get("price")?.userProvided).toBe(true);
  });

  it("STI subclass attribute declared AFTER base sees both attrs on the shared map", () => {
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

    expect(Triangle._attributeDefinitions.get("name")?.type.name).toBe("string");
    expect(Triangle._attributeDefinitions.get("sides")?.type.name).toBe("integer");
    expect(Shape._attributeDefinitions.get("sides")?.type.name).toBe("integer");
  });

  it("STI subclass encrypts() routes pending encryptions to the base", async () => {
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
        // Pre-PR: encrypts() on subclass would add to Dog._pendingEncryptions
        // while the attribute def lived on Animal — wrapper never applied.
        // Post-PR: encrypts() also routes to the STI base.
        this.encrypts("name");
      }
    }

    // Pending encryption is recorded on the base, not the subclass.
    expect(Object.prototype.hasOwnProperty.call(Animal, "_pendingEncryptions")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(Dog, "_pendingEncryptions")).toBe(false);

    // Both classes observe the encrypted attribute via the shared map.
    expect(isEncryptedAttribute(Animal, "name")).toBe(true);
    expect(isEncryptedAttribute(Dog, "name")).toBe(true);
    // No fork on the subclass.
    expect(Dog._attributeDefinitions).toBe(Animal._attributeDefinitions);
  });

  it("subclass attribute survives schema reflection on the STI base (end-to-end)", async () => {
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
        // Subclass-authored attribute declared BEFORE schema reflection
        // — the case previously documented as "STI note 2" (subclass
        // fork would shadow later base reflection). With the routing
        // fix this lives on the shared base map from the start.
        this.attribute("radius", "integer");
      }
    }

    const adapter = {
      schemaCache: {
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

    expect(Shape._attributeDefinitions.get("radius")?.type.name).toBe("integer");
    expect(Shape._attributeDefinitions.get("guid")?.type.name).toBe("uuid");
    expect(Circle._attributeDefinitions).toBe(Shape._attributeDefinitions);
    expect(Circle._attributeDefinitions.get("radius")?.type.name).toBe("integer");
    expect(Circle._attributeDefinitions.get("guid")?.type.name).toBe("uuid");
  });
});
