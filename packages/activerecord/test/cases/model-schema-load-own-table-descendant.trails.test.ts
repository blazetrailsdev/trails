import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { Base } from "../../lib/base.js";
import { adapterDouble, establishConnectionTo } from "../support/adapter-double.js";
import { loadSchema } from "../../lib/model-schema.js";
import { defaultValue } from "../../lib/type.js";
import { fixtures } from "../../lib/test-helpers/use-fixtures.js";

type Cols = Record<string, { sqlType: string; name: string; default: null }>;

function col(name: string): Cols[string] {
  return { sqlType: "varchar", name, default: null };
}

function makeAdapter(tables: Record<string, Cols>, asked: string[]): unknown {
  return adapterDouble({
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
    lookupCastTypeFromColumn: () => defaultValue(),
  });
}

const tables: Record<string, Cols> = {
  shapes: { id: col("id"), type: col("type"), sides: col("sides") },
  tickets: { id: col("id"), subject: col("subject") },
};

async function buildHierarchy(asked: string[]) {
  class Shape extends Base {
    static override tableName = "shapes";
    static {
      this.inheritanceColumn = "type";
    }
  }
  class Circle extends Shape {}
  constSet(TopLevel, "Circle", Circle);
  DescendantsTracker.registerSubclass(Shape, Circle);
  class Ticket extends Circle {
    static override tableName = "tickets";
  }
  constSet(TopLevel, "Ticket", Ticket);
  DescendantsTracker.registerSubclass(Circle, Ticket);
  class VipTicket extends Ticket {}
  constSet(TopLevel, "VipTicket", VipTicket);
  DescendantsTracker.registerSubclass(Ticket, VipTicket);

  for (const klass of [Shape, Circle, Ticket, VipTicket]) {
    await establishConnectionTo(klass, makeAdapter(tables, asked) as never);
  }
  return { Shape, Circle, Ticket, VipTicket };
}

describe("loadSchema — own-table descendant under an STI ancestor", () => {
  fixtures({}, { useTransactionalTests: false });
  it("reflects the descendant's own table, not the STI base's", async () => {
    const asked: string[] = [];
    const { Ticket } = await buildHierarchy(asked);

    const hash = Ticket.columnsHash();

    expect(asked).toContain("tickets");
    expect(Object.keys(hash).sort()).toEqual(["id", "subject"]);
    expect(hash).not.toHaveProperty("sides");
  });

  it("marks the descendant itself schema-loaded rather than the STI base", async () => {
    const asked: string[] = [];
    const { Shape, Ticket } = await buildHierarchy(asked);

    loadSchema.call(Ticket as never);

    expect((Ticket as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(true);
    expect((Shape as unknown as { _schemaLoaded: boolean })._schemaLoaded).toBe(false);
  });

  it("gives the descendant its own column set for attribute access", async () => {
    const asked: string[] = [];
    const { Ticket } = await buildHierarchy(asked);

    expect([...Ticket.columnNames()].sort()).toEqual(["id", "subject"]);
    expect(
      Ticket.columns()
        .map((c: { name: string }) => c.name)
        .sort(),
    ).toEqual(["id", "subject"]);
  });

  it("gives a subclass of an own-table descendant its base class's table", async () => {
    const asked: string[] = [];
    const { VipTicket } = await buildHierarchy(asked);

    expect(VipTicket.tableName).toBe("shapes");
    expect(Object.keys(VipTicket.columnsHash()).sort()).toEqual(["id", "sides", "type"]);
  });

  it("gives a genuine STI subclass the base's shared table", async () => {
    const asked: string[] = [];
    const { Circle } = await buildHierarchy(asked);

    const hash = Circle.columnsHash();

    expect(Object.keys(hash).sort()).toEqual(["id", "sides", "type"]);
    expect(asked).not.toContain("tickets");
    expect(Object.hasOwn(Circle, "_schemaLoaded")).toBe(true);
    expect(Object.hasOwn(Circle, "_columnsHash")).toBe(true);
  });
});
