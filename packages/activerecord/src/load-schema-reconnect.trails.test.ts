import { describe, it, expect, afterAll } from "vitest";
import { Edge } from "./test-helpers/models/edge.js";

async function establishAndMigrate(): Promise<void> {
  await Edge.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  await Edge.withConnection(async (connection) => {
    await connection.createTable("edges", { id: false }, (t) => {
      t.column("source_id", "integer", { null: false });
      t.column("sink_id", "integer", { null: false });
    });
  });
}

describe("loadSchema after a connection is re-established", () => {
  afterAll(() => Edge.removeConnection());

  it("keeps the primary-key latch and the schema-loaded flag together", async () => {
    await establishAndMigrate();
    await Edge.loadSchema();
    expect(await Edge.count()).toBe(0);

    await establishAndMigrate();
    await Edge.loadSchema();
    expect(Edge.primaryKey).toBeNull();
    const edge = new Edge({ source_id: 1, sink_id: 2 });
    expect(await edge.save()).toBe(true);
    expect(await Edge.count()).toBe(1);
  });
});
