import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { resetColumnInformation } from "./model-schema.js";

class UuidType extends ValueType {
  override readonly name = "uuid" as unknown as "value";
}

function makeAdapter(columns: Record<string, unknown>): unknown {
  return {
    schemaCache: {
      isCached: () => true,
      getCachedColumnsHash: () => columns,
      dataSourceExists: async () => true,
      columnsHash: async () => columns,
    },
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return column.sqlType === "uuid" ? new UuidType() : null;
    },
  };
}

describe("sync loadSchema / columnsHash", () => {
  it("columnsHash returns cached Column objects when schema cache is populated", () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Post as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    const hash = Post.columnsHash();

    expect(hash.guid).toBe(cols.guid);
    expect(Post._attributeDefinitions.get("guid")?.source).toBe("schema");
  });

  it("columnsHash filters ignoredColumns out of the cached hash", () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    (Post as unknown as { _ignoredColumns: string[] })._ignoredColumns = ["secret"];
    const cols = {
      guid: { sqlType: "uuid", name: "guid", default: null },
      secret: { sqlType: "uuid", name: "secret", default: null },
    };
    (Post as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    const hash = Post.columnsHash();

    expect(hash.guid).toBeDefined();
    expect(hash.secret).toBeUndefined();
  });

  it("falls back to synthesized hash when no schema cache is available", () => {
    class Widget extends Base {
      static override tableName = "widgets";
      static {
        this.attribute("name", "string");
      }
    }
    // No adapter — loadSchema's fallback path kicks in.
    const hash = Widget.columnsHash();
    expect(hash.name.type).toBe("string");
  });

  it("STI subclass reflection delegates to base, without forking defs", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("type", "string");
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    (Circle as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    // Trigger load on subclass — must reflect on the STI base and
    // subclass shares the base's map (same reference).
    Circle.columnsHash();

    expect(Shape._attributeDefinitions.get("guid")?.source).toBe("schema");
    expect(Circle._attributeDefinitions).toBe(Shape._attributeDefinitions);
  });

  it("STI reflection falls back to subclass adapter when base has none", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("type", "string");
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    // Adapter ONLY on the subclass (Shape has none).
    (Circle as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    Circle.columnsHash();

    // Reflection should have landed on the STI base via subclass adapter;
    // subclass shares the base's map reference.
    expect(Shape._attributeDefinitions.get("guid")?.source).toBe("schema");
    expect(Circle._attributeDefinitions).toBe(Shape._attributeDefinitions);
  });

  it("columnsHash on STI subclass returns cached Column objects from base adapter", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    const hash = Circle.columnsHash();
    expect(hash.guid).toBe(cols.guid);
  });

  it("synthesized columnsHash fallback filters ignoredColumns", () => {
    class Widget extends Base {
      static override tableName = "widgets";
      static {
        this.attribute("name", "string");
        this.attribute("secret", "string");
      }
    }
    (Widget as unknown as { _ignoredColumns: string[] })._ignoredColumns = ["secret"];

    const hash = Widget.columnsHash();
    expect(hash.name).toBeDefined();
    expect(hash.secret).toBeUndefined();
  });

  it("marks STI base as _schemaLoaded when subclass triggered reflection", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    Circle.columnsHash(); // subclass triggers, but work lands on base

    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
    expect((Circle as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
  });

  it("resetColumnInformation scrubs schema-sourced defs from a subclass-forked map", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    // Fork the subclass map and put a schema-sourced def in it directly.
    (Circle as unknown as { _attributeDefinitions: Map<string, unknown> })._attributeDefinitions =
      new Map([
        [
          "guid",
          {
            name: "guid",
            type: { name: "uuid" },
            defaultValue: null,
            userProvided: false,
            source: "schema",
          },
        ],
      ]);

    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Circle);

    expect(Circle._attributeDefinitions.has("guid")).toBe(false);
  });

  it("preserves subclass-declared attributes when unifying with STI base map", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {
      static {
        // User attribute declared on subclass — forks Circle's map.
        this.attribute("radius", "integer");
      }
    }

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    Circle.columnsHash();

    // Merged: base reflects guid, subclass's radius survives.
    expect(Circle._attributeDefinitions.get("guid")?.source).toBe("schema");
    expect(Circle._attributeDefinitions.get("radius")?.userProvided).toBe(true);
    expect(Shape._attributeDefinitions.get("radius")?.userProvided).toBe(true);
    expect(Circle._attributeDefinitions).toBe(Shape._attributeDefinitions);
  });

  it("reflection deletes own-caches on subclass so base rebuilds shine through", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    (Circle as unknown as { _columnsHash: unknown })._columnsHash = { stale: true };
    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    Circle.columnsHash();

    expect(Object.prototype.hasOwnProperty.call(Circle, "_columnsHash")).toBe(false);
  });

  it("resetting the STI base propagates to subclasses (no stale _schemaLoaded shadow)", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    // Load via subclass — flag should land on the base only.
    Circle.columnsHash();
    expect(Object.prototype.hasOwnProperty.call(Circle, "_schemaLoaded")).toBe(false);
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);

    // Reset base — subclass inherits the reset via prototype chain.
    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Shape);
    expect((Circle as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
  });

  it("invalidates subclass-local caches when reflection lands on STI base", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    // Pre-populate stale caches on the subclass.
    (Circle as unknown as { _columnsHash: unknown })._columnsHash = { stale: true };
    (Circle as unknown as { _columns: unknown })._columns = ["stale"];

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    Circle.columnsHash();

    expect((Circle as unknown as { _columnsHash: unknown })._columnsHash).toBeUndefined();
    expect((Circle as unknown as { _columns: unknown })._columns).toBeUndefined();
  });

  it("resetColumnInformation on STI subclass resets the STI base", () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Shape as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    Shape.columnsHash();
    expect(Shape._attributeDefinitions.get("guid")?.source).toBe("schema");

    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Circle);

    expect(Shape._attributeDefinitions.has("guid")).toBe(false);
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
  });

  it("resetColumnInformation drops schema-sourced defs but preserves user defs", () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
      }
    }
    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    (Post as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    Post.columnsHash(); // triggers reflection

    expect(Post._attributeDefinitions.get("guid")?.source).toBe("schema");
    expect(Post._attributeDefinitions.get("title")?.source).toBe("user");

    (resetColumnInformation as any).call(Post);

    expect(Post._attributeDefinitions.has("guid")).toBe(false);
    expect(Post._attributeDefinitions.get("title")?.source).toBe("user");
  });
});
