import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";

class DoublingType extends ValueType {
  override type(): string {
    return "doubling";
  }
  override deserialize(value: unknown): unknown {
    return typeof value === "string" ? value + value : value;
  }
}

function makeAdapter(columns: Record<string, unknown>): unknown {
  return {
    internalSchemaCache: {
      isCached: () => true,
      getCachedColumnsHash: () => columns,
      dataSourceExists: async () => true,
      columnsHash: async () => columns,
    },
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return column.sqlType === "doubling" ? new DoublingType() : null;
    },
  };
}

describe("_instantiate routes row values through adapter-resolved types", () => {
  it("applies the schema-reflected cast type's deserialize on hydration", () => {
    class Widget extends Base {
      static override tableName = "widgets";
    }
    const cols = { payload: { sqlType: "doubling", name: "payload", default: null } };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    const rec = Widget._instantiate({ payload: "ab" });

    expect((rec as unknown as { payload: string }).payload).toBe("abab");
  });

  it("falls back to ValueType when adapter has no cast for the column", () => {
    class Widget extends Base {
      static override tableName = "widgets";
    }
    const cols = { blob: { sqlType: "unknown", name: "blob", default: null } };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(cols);

    const rec = Widget._instantiate({ blob: "raw" });

    expect((rec as unknown as { blob: string }).blob).toBe("raw");
  });

  it("picks up a new adapter's types after an adapter swap", async () => {
    class Widget extends Base {
      static override tableName = "widgets";
    }
    const colsA = { payload: { sqlType: "unknown", name: "payload", default: null } };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(colsA);
    await Widget.loadSchema();

    expect(Widget.typeForAttribute("payload")!.type()).toBeUndefined();

    const colsB = { payload: { sqlType: "doubling", name: "payload", default: null } };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(colsB);
    await Widget.loadSchema();

    expect(Widget.typeForAttribute("payload")!.type()).toBe("doubling");
  });

  it("drops stale schema-sourced columns on adapter swap", async () => {
    class Widget extends Base {
      static override tableName = "widgets";
    }
    const colsA = {
      payload: { sqlType: "doubling", name: "payload", default: null },
      removed: { sqlType: "doubling", name: "removed", default: null },
    };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(colsA);
    await Widget.loadSchema();
    expect(Object.keys(Widget.columnsHash())).toContain("removed");

    const colsB = { payload: { sqlType: "doubling", name: "payload", default: null } };
    (Widget as unknown as { adapter: unknown }).adapter = makeAdapter(colsB);
    await Widget.loadSchema();

    expect(Object.keys(Widget.columnsHash())).not.toContain("removed");
    expect(Object.getOwnPropertyDescriptor(Widget.prototype, "removed")).toBeUndefined();
  });
});
