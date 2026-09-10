import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { adapterDouble, establishConnectionTo } from "./test-helpers/adapter-double.js";
import { registerSubclass } from "./inheritance.js";
import { resetColumnInformation } from "./model-schema.js";
import { defaultValue } from "./type.js";

class UuidType extends ValueType {
  override type(): string {
    return "uuid";
  }
}

function makeAdapter(columns: Record<string, unknown>): unknown {
  return adapterDouble({
    internalSchemaCache: {
      isCached: () => true,
      getCachedColumnsHash: () => columns,
      dataSourceExists: async () => true,
      columnsHash: async () => columns,
    },
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return column.sqlType === "uuid" ? new UuidType() : null;
    },
  });
}

describe("sync loadSchema / columnsHash", () => {
  it("columnsHash returns cached Column objects when schema cache is populated", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Post, makeAdapter(cols) as never);

    const hash = Post.columnsHash();

    expect(hash.guid).toBe(cols.guid);
  });

  it("columnsHash filters ignoredColumns out of the cached hash", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    (Post as unknown as { _ignoredColumns: string[] })._ignoredColumns = ["secret"];
    const cols = {
      guid: { sqlType: "uuid", name: "guid", default: null },
      secret: { sqlType: "uuid", name: "secret", default: null },
    };
    await establishConnectionTo(Post, makeAdapter(cols) as never);

    const hash = Post.columnsHash();

    expect(hash.guid).toBeDefined();
    expect(hash.secret).toBeUndefined();
  });

  it("returns an empty hash when no schema cache is available", async () => {
    class Widget extends Base {
      static override tableName = "widgets";
      static {
        this.attribute("name", "string");
      }
    }
    expect(Widget.columnsHash()).toEqual({});
  });

  it("STI subclass reflects its own table into its own defs", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("type", "string");
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);
    await establishConnectionTo(Circle, makeAdapter(cols) as never);

    Circle.columnsHash();

    expect(Object.prototype.hasOwnProperty.call(Circle, "_columnsHash")).toBe(true);
    expect(Object.keys(Circle.columnsHash())).toContain("guid");
    expect(Object.keys(Shape.columnsHash())).toContain("guid");
  });

  it.skip("STI reflection falls back to subclass adapter when base has none", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
        this.attribute("type", "string");
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Circle, makeAdapter(cols) as never);

    Circle.columnsHash();

    expect(Object.keys(Shape.columnsHash())).toContain("guid");
  });

  it("columnsHash on STI subclass returns cached Column objects from base adapter", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);

    const hash = Circle.columnsHash();
    expect(hash.guid).toBe(cols.guid);
  });

  it("marks the reflecting class as _schemaLoaded, not its STI base", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);

    Circle.columnsHash();

    expect(Object.prototype.hasOwnProperty.call(Circle, "_schemaLoaded")).toBe(true);
    expect((Circle as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
  });

  it("preserves subclass-declared attributes across the subclass's reflection", async () => {
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

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);

    Circle.columnsHash();

    expect(Circle.typeForAttribute("radius")!.type()).toBe("integer");
    expect(Shape.typeForAttribute("radius")!.type()).toBeUndefined();
    expect(Object.hasOwn(Circle, "_pendingAttributeModifications")).toBe(true);
  });

  it("reflection replaces a stale own columnsHash on the reflecting class", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);
    void Circle.resetColumnInformation();

    expect(Object.keys(Circle.columnsHash())).toEqual(["guid"]);
  });

  it("resetting the STI base propagates to subclasses", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);

    Circle.columnsHash();
    expect(Object.prototype.hasOwnProperty.call(Circle, "_schemaLoaded")).toBe(true);

    registerSubclass(Circle);
    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Shape);
    expect((Circle as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
  });

  it("reflection on an STI subclass rebuilds its own column caches", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);

    Circle.columnsHash();

    expect(Object.prototype.hasOwnProperty.call(Circle, "_columnsHash")).toBe(true);
    expect(
      Object.keys((Circle as unknown as { _columnsHash: Record<string, unknown> })._columnsHash),
    ).toEqual(["guid"]);
  });

  it("resetColumnInformation on the base deletes a tracked STI subclass's own schema memos", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {
      static {
        registerSubclass(this);
      }
    }

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);
    Circle.columnsHash();

    const memoKeys = [
      "_columnsHash",
      "_columns",
      "_attributesBuilder",
      "_schemaLoaded",
      "_cachedDefaultAttributes",
      "_returningColumnsForInsertCache",
    ];
    for (const key of memoKeys)
      (Circle as unknown as Record<string, unknown>)[key] = { stale: true };

    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Shape);

    for (const key of memoKeys) {
      expect((Circle as unknown as Record<string, unknown>)[key], key).toBeFalsy();
    }
    expect(Object.keys(Circle.columnsHash())).toEqual(["guid"]);
  });

  it("resetColumnInformation on the base reloads a tracked non-STI subclass's schema memos", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    class SpecialPost extends Post {
      static override tableName = "special_posts";
      static {
        registerSubclass(this);
      }
    }

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Post, makeAdapter(cols) as never);
    await establishConnectionTo(SpecialPost, makeAdapter(cols) as never);
    SpecialPost.columnsHash();
    expect((SpecialPost as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);

    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Post);

    expect((SpecialPost as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
    expect((SpecialPost as unknown as { _columnsHash: unknown })._columnsHash == null).toBe(true);
  });

  it("resetColumnInformation on an STI subclass leaves the STI base alone", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Shape, makeAdapter(cols) as never);
    Shape.columnsHash();

    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Circle);

    expect(Object.keys(Shape.columnsHash())).toContain("guid");
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
  });

  it("resetColumnInformation drops schema-sourced defs but preserves user defs", async () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
      }
    }
    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    await establishConnectionTo(Post, makeAdapter(cols) as never);
    Post.columnsHash();

    expect(Object.keys(Post.columnsHash())).toContain("guid");
    expect(Post.typeForAttribute("title")!.type()).toBe("string");

    (resetColumnInformation as any).call(Post);

    expect((Post as unknown as { _columnsHash: unknown })._columnsHash == null).toBe(true);
    expect(Post.typeForAttribute("title")!.type()).toBe("string");
  });

  function makeResettableAdapter(cols: Record<string, unknown>) {
    let warm = true;
    const calls = { clear: 0 };
    return {
      calls,
      isWarm: () => warm,
      adapter: adapterDouble({
        internalSchemaCache: {
          isCached: () => warm,
          getCachedColumnsHash: () => (warm ? cols : undefined),
          dataSourceExists: async () => true,
          columnsHash: async () => cols,
          clearDataSourceCacheBang: () => {
            calls.clear += 1;
            warm = false;
          },
        },
        lookupCastTypeFromColumn: () => defaultValue(),
      }),
    };
  }

  it("resetColumnInformation clears the data source cache when eager warming is off (default)", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const cols = { id: { sqlType: "integer", name: "id", default: null } };
    const built = makeResettableAdapter(cols);
    await establishConnectionTo(Post, built.adapter as never);
    Post.connectionPool().poolConfig.schemaCache = built.adapter.internalSchemaCache as never;
    Post.columnsHash();

    built.calls.clear = 0;
    (resetColumnInformation as unknown as (this: typeof Base) => void).call(Post);

    expect(built.calls.clear).toBe(1);
    expect(built.isWarm()).toBe(false);
  });
});
