import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { adapterDouble, establishConnectionTo } from "./test-helpers/adapter-double.js";
import { reloadSchemaFromCache } from "./model-schema.js";
import { registerModel } from "./associations.js";

class UuidType extends ValueType {
  override type(): string {
    return "uuid";
  }
}

function makeAdapter(columns: Record<string, unknown>): unknown {
  const cache = {
    isCached: () => true,
    getCachedColumnsHash: () => columns,
    dataSourceExists: async () => true,
    columnsHash: async () => columns,
    primaryKeys: async () => null,
  };
  return adapterDouble({
    schemaCache: cache,
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return column.sqlType === "uuid" ? new UuidType() : null;
    },
  });
}

const own = <T>(host: object, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(host, key) ? (host as Record<string, T>)[key] : undefined;

describe("reloadSchemaFromCache recursion — non-STI descendant under STI", () => {
  it("invalidates an own-table descendant's schema memos when an STI ancestor reloads", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}
    registerModel(Circle);
    class Ticket extends Circle {
      static override tableName = "tickets";
    }
    registerModel(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Circle, Ticket]) {
      await establishConnectionTo(klass, makeAdapter(cols) as never);
    }

    await Ticket.loadSchema();
    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeDefined();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(true);
    Ticket.columnNames();
    expect(own<unknown>(Ticket, "_columnNames")).toBeDefined();

    reloadSchemaFromCache.call(Shape as never);

    expect(own<unknown>(Ticket, "_columnNames")).toBeUndefined();

    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(false);
    expect(own<Record<string, unknown>>(Ticket, "_columnsHash")).toBeUndefined();
  });

  it("reloads an own-table descendant in full when it is the reload target, without redirecting to the STI base", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Circle extends Shape {}
    registerModel(Circle);
    class Ticket extends Circle {
      static override tableName = "tickets";
    }
    registerModel(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Circle, Ticket]) {
      await establishConnectionTo(klass, makeAdapter(cols) as never);
    }

    await Ticket.loadSchema();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(true);
    const shapeLoadedBefore = own<boolean>(Shape, "_schemaLoaded");

    reloadSchemaFromCache.call(Ticket as never);

    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(false);
    expect(own<boolean>(Shape, "_schemaLoaded")).toBe(shapeLoadedBefore);
  });

  it("leaves descendants' schema memos intact on a non-recursive reload and drops the yaml encoder", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
    }
    class Ticket extends Shape {
      static override tableName = "tickets";
    }
    registerModel(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Ticket]) {
      await establishConnectionTo(klass, makeAdapter(cols) as never);
    }

    await Shape.loadSchema();
    await Ticket.loadSchema();
    Shape.yamlEncoder();
    expect(own<unknown>(Shape, "_yamlEncoder")).toBeDefined();

    reloadSchemaFromCache.call(Shape as never, false);

    expect(own<unknown>(Shape, "_yamlEncoder")).toBeUndefined();
    expect(own<boolean>(Shape, "_schemaLoaded")).toBe(false);
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(true);
  });
});

describe("resetColumnInformation undefines attribute methods (model_schema.rb:525)", () => {
  it("undefines the generated attribute methods of the class and its descendants", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
    }
    registerModel(Shape);
    class Ticket extends Shape {
      static override tableName = "tickets";
    }
    registerModel(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Ticket]) {
      await establishConnectionTo(klass, makeAdapter(cols) as never);
      await klass.loadSchema();
      klass.defineAttributeMethods();
      expect(own<boolean>(klass, "_attributeMethodsGenerated")).toBe(true);
      expect(klass.generatedAttributeMethods().instanceMethods()).toContain("guid");
    }

    await Shape.resetColumnInformation();

    expect(own<boolean>(Shape, "_attributeMethodsGenerated")).toBe(false);
    expect(own<boolean>(Ticket, "_attributeMethodsGenerated")).toBe(false);
    expect(Shape.generatedAttributeMethods().instanceMethods()).not.toContain("guid");
    expect(Ticket.generatedAttributeMethods().instanceMethods()).not.toContain("guid");
  });
});
