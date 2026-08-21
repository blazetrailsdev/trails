import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { loadSchema, reloadSchemaFromCache } from "./model-schema.js";

type Cols = Record<string, { sqlType: string; name: string; default: null }>;

function col(name: string): Cols[string] {
  return { sqlType: "varchar", name, default: null };
}

const columns: Cols = { number: col("number"), title: col("title") };

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
    // A subclass that never called `registerSubclass` is unreachable from
    // `reload_schema_from_cache`'s descendant walk, so an ancestor
    // invalidation bumps the ancestor's revision past the subclass's own and
    // leaves the subclass permanently stale. This is the shape the nightly
    // stats sync hits: its models are plain `extends Base` classes whose
    // columns come from `attribute()` declarations, so the load settles on the
    // synthesize arm rather than on a reflected schema-cache entry.
    class PullRequest extends Base {
      static {
        this.tableName = "pull_requests";
        this.primaryKey = "number";
        this.attribute("number", "integer");
        this.attribute("title", "string");
      }
    }
    (PullRequest as unknown as { adapter: unknown }).adapter = makeAdapter();

    reloadSchemaFromCache.call(Base as never);

    expect(() => loadSchema.call(PullRequest as never)).not.toThrow();
    expect(Object.keys(PullRequest.columnsHash())).toEqual(["number", "title"]);
  });
});
