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
  // trails fidelity gap: Rails' reload_schema_from_cache recurses `subclasses.each`
  // reaching EVERY descendant. A subclass that owns its `table_name` sits under an
  // STI subclass but carries an independent schema, so it must be reloaded in full
  // — not merely have its local STI overlay caches cleared, which leaves its own
  // `_schemaLoadPromise` / `_schemaRevision` memos stale.
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

    // Reflect on the own-table descendant FIRST, so it owns its schema-load
    // promise (rather than inheriting the base's).
    await Ticket.loadSchema();
    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeDefined();
    const revisionBefore = own<number>(Ticket, "_schemaRevision");

    // Reload from an STI ancestor (Rails: a `lockingColumn=` / `ignoredColumns=`
    // change on Shape drives this). Every descendant must be invalidated.
    reloadSchemaFromCache.call(Shape as never);

    // On current main the own-table descendant only gets its local caches
    // cleared, so its load-promise memo survives and it never re-reflects.
    expect(own<Promise<void>>(Ticket, "_schemaLoadPromise")).toBeUndefined();
    expect(own<number>(Ticket, "_schemaRevision")).toBe((revisionBefore ?? 0) + 1);
  });
});
