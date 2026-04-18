import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";

// Custom type proves the adapter-resolved cast reaches the record —
// its deserialize doubles a string so we can assert it ran.
class DoublingType extends ValueType {
  override readonly name = "doubling" as unknown as "value";
  override deserialize(value: unknown): unknown {
    return typeof value === "string" ? value + value : value;
  }
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

    // DoublingType.deserialize doubled the raw DB value.
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
});
