import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { reloadSchemaFromCache } from "./model-schema.js";
import { registerSubclass } from "./inheritance.js";

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
    const revisionBefore = own<number>(Ticket, "_schemaRevision");

    reloadSchemaFromCache.call(Shape as never);

    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<number>(Ticket, "_schemaRevision")).toBe((revisionBefore ?? 0) + 1);
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
    const ticketRevisionBefore = own<number>(Ticket, "_schemaRevision");
    const shapeRevisionBefore = own<number>(Shape, "_schemaRevision");

    reloadSchemaFromCache.call(Ticket as never);

    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<number>(Ticket, "_schemaRevision")).toBe((ticketRevisionBefore ?? 0) + 1);
    expect(own<number>(Shape, "_schemaRevision")).toBe(shapeRevisionBefore);
  });

  it("routes a shared-table STI child of an own-table descendant to the overlay clear, not a full reload", async () => {
    class Shape extends Base {
      static override tableName = "shapes";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Ticket extends Shape {
      static override tableName = "tickets";
      static {
        this.inheritanceColumn = "type";
      }
    }
    registerSubclass(Ticket);
    class Urgent extends Ticket {}
    registerSubclass(Urgent);

    const cols = { guid: { sqlType: "uuid", name: "guid", default: null } };
    for (const klass of [Shape, Ticket, Urgent]) {
      (klass as unknown as { adapter: unknown }).adapter = makeAdapter(cols);
    }

    await Urgent.loadSchema();
    const urgentRevisionBefore = own<number>(Urgent, "_schemaRevision");
    const ticketRevisionBefore = own<number>(Ticket, "_schemaRevision");
    const shapeRevisionBefore = own<number>(Shape, "_schemaRevision");

    reloadSchemaFromCache.call(Urgent as never);

    // Overlay clear: Urgent's own memos are dropped without bumping its
    // revision, and the full reload lands on Ticket (its schema host), not
    // Shape (the topmost STI ancestor).
    expect(own<number>(Urgent, "_schemaRevision")).toBe(urgentRevisionBefore);
    expect(own<boolean>(Urgent, "_schemaLoaded")).toBeUndefined();
    expect(own<number>(Ticket, "_schemaRevision")).toBe((ticketRevisionBefore ?? 0) + 1);
    expect(own<number>(Shape, "_schemaRevision")).toBe(shapeRevisionBefore);
  });
});
