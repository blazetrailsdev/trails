import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { reloadSchemaFromCache } from "./model-schema.js";
import { registerSubclass } from "./inheritance.js";

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
  return {
    internalSchemaCache: cache,
    schemaCache: cache,
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return column.sqlType === "uuid" ? new UuidType() : null;
    },
  };
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
    registerSubclass(Circle);
    class Ticket extends Circle {
      static override tableName = "tickets";
    }
    registerSubclass(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Circle, Ticket]) {
      (klass as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    }

    await Ticket.loadSchema();
    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeDefined();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(true);

    reloadSchemaFromCache.call(Shape as never);

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
    registerSubclass(Circle);
    class Ticket extends Circle {
      static override tableName = "tickets";
    }
    registerSubclass(Ticket);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Circle, Ticket]) {
      (klass as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    }

    await Ticket.loadSchema();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(true);
    const shapeLoadedBefore = own<boolean>(Shape, "_schemaLoaded");

    reloadSchemaFromCache.call(Ticket as never);

    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<boolean>(Ticket, "_schemaLoaded")).toBe(false);
    expect(own<boolean>(Shape, "_schemaLoaded")).toBe(shapeLoadedBefore);
  });
});
