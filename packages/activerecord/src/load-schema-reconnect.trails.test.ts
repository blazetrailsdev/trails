import { describe, it, expect, afterAll } from "vitest";
import { Base } from "./base.js";

class ReconnectRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

class ReconnectEdge extends ReconnectRecord {
  static override tableName = "reconnect_edges";
}

async function establishAndMigrate(): Promise<void> {
  await ReconnectRecord.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  await ReconnectRecord.withConnection(async (connection) => {
    await connection.createTable("reconnect_edges", { id: false }, (t) => {
      t.column("source_id", "integer", { null: false });
      t.column("sink_id", "integer", { null: false });
    });
  });
}

describe("loadSchema after a connection is re-established", () => {
  afterAll(async () => {
    await ReconnectRecord.withConnection((connection) => connection.dropTable("reconnect_edges"));
    await ReconnectRecord.removeConnection();
  });

  it("keeps the primary-key latch and the schema-loaded flag together", async () => {
    await establishAndMigrate();
    await ReconnectEdge.loadSchema();
    expect(await ReconnectEdge.count()).toBe(0);

    await establishAndMigrate();
    await ReconnectEdge.loadSchema();
    expect(ReconnectEdge.primaryKey).toBeNull();
    const edge = new ReconnectEdge({ source_id: 1, sink_id: 2 });
    expect(await edge.save()).toBe(true);
    expect(await ReconnectEdge.count()).toBe(1);
  });
});
