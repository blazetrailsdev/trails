import { describe, expect, it } from "vitest";
import { FakeActiveRecordAdapter } from "./fake-adapter.js";
import { resolve } from "../connection-adapters.js";

describe("FakeActiveRecordAdapter", () => {
  it("is registered under the name fake", async () => {
    await expect(resolve("fake")).resolves.toBe(
      FakeActiveRecordAdapter as unknown as Awaited<ReturnType<typeof resolve>>,
    );
  });

  it("primary_key falls back to id", () => {
    const adapter = new FakeActiveRecordAdapter();
    expect(adapter.primaryKey("fake_widgets")).toBe("id");

    adapter.primaryKeys = { fake_widgets: "widget_id" };
    expect(adapter.primaryKey("fake_widgets")).toBe("widget_id");
  });

  it("merge_column appends synthetic columns readable through columns", () => {
    const adapter = new FakeActiveRecordAdapter();
    adapter.mergeColumn("fake_contacts", "name", "string");
    adapter.mergeColumn("fake_contacts", "age", "integer", { null: false, default: 0 });

    const columns = adapter.columns("fake_contacts");
    expect(columns.map((c) => c.name)).toEqual(["name", "age"]);
    expect(columns[1].null).toBe(false);
    expect(columns[1].default).toBe(0);
    expect(columns[0].sqlTypeMetadata?.sqlType).toBe("string");
    // `type` is the cast type's own `type`, not the sql_type string: the
    // abstract TYPE_MAP keys strings under /char/i, so "string" falls through
    // to Type::Value (nil type) exactly as it does in Rails, while "integer"
    // matches /int/i.
    expect(columns[0].sqlTypeMetadata?.type).toBeUndefined();
    expect(columns[1].sqlTypeMetadata?.type).toBe("integer");
  });

  it("columns is empty for an unknown table", () => {
    const adapter = new FakeActiveRecordAdapter();
    expect(adapter.columns("fake_nothing")).toEqual([]);
  });

  it("data_source_exists? and active? are always true", async () => {
    const adapter = new FakeActiveRecordAdapter();
    expect(await adapter.dataSourceExists()).toBe(true);
    expect(adapter.active).toBe(true);
  });

  it("shares the synthetic column list across instances", () => {
    new FakeActiveRecordAdapter().mergeColumn("fake_shared", "id", "integer");
    const other = new FakeActiveRecordAdapter();
    expect(other.columns("fake_shared").map((c) => c.name)).toEqual(["id"]);
  });
});
