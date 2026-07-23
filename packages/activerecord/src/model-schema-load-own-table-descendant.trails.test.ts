import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { registerSubclass } from "./inheritance.js";
import { loadSchema } from "./model-schema.js";

type Cols = Record<string, { sqlType: string; name: string; default: null }>;

function col(name: string): Cols[string] {
  return { sqlType: "varchar", name, default: null };
}

function makeAdapter(tables: Record<string, Cols>, asked: string[]): unknown {
  return {
    schemaCache: {
      isCached: () => true,
      getCachedColumnsHash: (table: string) => {
        asked.push(table);
        return tables[table];
      },
      dataSourceExists: async () => true,
      columnsHash: async (_pool: unknown, table: string) => {
        asked.push(table);
        return tables[table];
      },
    },
    lookupCastTypeFromColumn: () => null,
  };
}

const tables: Record<string, Cols> = {
  shapes: { id: col("id"), type: col("type"), sides: col("sides") },
  tickets: { id: col("id"), subject: col("subject") },
};

function buildHierarchy(asked: string[]) {
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

  for (const klass of [Shape, Circle, Ticket]) {
    (klass as unknown as { adapter: unknown }).adapter = makeAdapter(tables, asked);
  }
  return { Shape, Circle, Ticket };
}

describe("loadSchema — own-table descendant under an STI ancestor", () => {
  it("reflects the descendant's own table, not the STI base's", () => {
    const asked: string[] = [];
    const { Ticket } = buildHierarchy(asked);

    const hash = Ticket.columnsHash();

    expect(asked).toContain("tickets");
    expect(Object.keys(hash).sort()).toEqual(["id", "subject"]);
    expect(hash).not.toHaveProperty("sides");
  });

  it("marks the descendant itself schema-loaded rather than the STI base", () => {
    const asked: string[] = [];
    const { Shape, Ticket } = buildHierarchy(asked);

    loadSchema.call(Ticket as never);

    expect((Ticket as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
  });

  it("gives the descendant its own column set for attribute access", () => {
    const asked: string[] = [];
    const { Ticket } = buildHierarchy(asked);

    expect([...Ticket.columnNames()].sort()).toEqual(["id", "subject"]);
    expect(
      Ticket.columns()
        .map((c: { name: string }) => c.name)
        .sort(),
    ).toEqual(["id", "subject"]);
  });

  it("still redirects a genuine STI subclass to the base's shared table", () => {
    const asked: string[] = [];
    const { Shape, Circle } = buildHierarchy(asked);

    const hash = Circle.columnsHash();

    expect(Object.keys(hash).sort()).toEqual(["id", "sides", "type"]);
    expect(asked).not.toContain("tickets");
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(Circle, "_schemaLoaded")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Circle, "_attributeDefinitions")).toBe(false);
  });
});
