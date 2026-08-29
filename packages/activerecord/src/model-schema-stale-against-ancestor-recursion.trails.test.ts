import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { loadSchema, reloadSchemaFromCache } from "./model-schema.js";

type Cols = Record<string, { sqlType: string; name: string; default: null }>;

function col(name: string): Cols[string] {
  return { sqlType: "varchar", name, default: null };
}

const columns: Cols = { id: col("id"), title: col("title") };

function makeAdapter(): unknown {
  return {
    internalSchemaCache: {
      isCached: () => true,
      getCachedColumnsHash: () => undefined,
      dataSourceExists: async () => true,
      columnsHash: async () => columns,
    },
    lookupCastTypeFromColumn: () => null,
  };
}

describe("loadSchema — subclass left stale by an ancestor invalidation", () => {
  it("settles the load instead of re-entering it until the stack overflows", () => {
    class Topic extends Base {
      static {
        this.tableName = "topics";
        this.attribute("id", "integer");
        this.attribute("title", "string");
      }
    }
    (Topic as unknown as { adapter: unknown }).adapter = makeAdapter();

    reloadSchemaFromCache.call(Base as never);

    expect(() => loadSchema.call(Topic as never)).not.toThrow();
    expect(Topic.columnsHash()).toEqual({});
    expect((Topic as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBe(false);
  });
});
