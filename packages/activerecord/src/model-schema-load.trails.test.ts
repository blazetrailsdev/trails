import { describe, it, expect, beforeEach } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./base.js";
import { loadSchemaFromAdapter } from "./model-schema.js";

class UuidType extends ValueType {
  override type(): string {
    return "uuid";
  }
}

class JsonbType extends ValueType {
  override type(): string {
    return "jsonb";
  }
}

function makeAdapter(
  columns: Record<string, { sqlType: string; default?: unknown }>,
  typeByColumn: Record<string, ValueType>,
): unknown {
  const hash = columns as unknown as Record<string, unknown>;
  const cache = {
    dataSourceExists: async () => true,
    columnsHash: async () => hash,
    primaryKeys: async () => null,
    getCachedColumnsHash: () => hash,
    isCached: () => true,
  };
  return {
    internalSchemaCache: cache,
    schemaCache: cache,
    lookupCastTypeFromColumn(column: { sqlType: string }) {
      return typeByColumn[column.sqlType] ?? null;
    },
  };
}

describe("loadSchemaFromAdapter", () => {
  let Model: typeof Base;

  beforeEach(() => {
    class Post extends Base {
      static override tableName = "posts";
    }
    Model = Post as typeof Base;
  });

  it("registers schema-sourced attribute definitions from cached columns", async () => {
    const adapter = makeAdapter(
      {
        guid: { sqlType: "uuid" },
        payload: { sqlType: "jsonb", default: null },
      },
      { uuid: new UuidType(), jsonb: new JsonbType() },
    );
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model.typeForAttribute("guid")!.type()).toBe("uuid");
    expect(Model.typeForAttribute("payload")!.type()).toBe("jsonb");
  });

  it("does not overwrite user-declared attributes", async () => {
    Model.attribute("guid", "string");
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model.typeForAttribute("guid")!.type()).toBe("string");
  });

  it("is a no-op for abstract classes", async () => {
    (Model as unknown as { _abstractClass: boolean })._abstractClass = true;
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect((Model as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBeFalsy();
  });

  it("reflects on a concrete subclass of an abstract parent", async () => {
    class ApplicationRecord extends Base {
      static override _abstractClass = true;
    }
    class Post extends ApplicationRecord {
      static override tableName = "posts";
    }
    expect(Object.prototype.hasOwnProperty.call(Post, "_abstractClass")).toBe(false);
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Post as typeof Base);

    expect(Object.keys((Post as typeof Base).columnsHash())).toContain("guid");
  });

  it("is a no-op when data source does not exist (explicit false)", async () => {
    const cache = {
      dataSourceExists: async () => false,
      columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      primaryKeys: async () => null,
    };
    const adapter = {
      internalSchemaCache: cache,
      schemaCache: cache,
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect((Model as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBeFalsy();
  });

  it("falls through when dataSourceExists returns undefined (probe not implemented)", async () => {
    const cache = {
      dataSourceExists: async () => undefined,
      columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      primaryKeys: async () => null,
      getCachedColumnsHash: () => ({ guid: { sqlType: "uuid" } }),
    };
    const adapter = {
      internalSchemaCache: cache,
      schemaCache: cache,
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect((Model as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBe(true);
  });

  it("falls back to ValueType when adapter has no cast type", async () => {
    const mysteryHash = { mystery: { sqlType: "weird" } };
    const cache = {
      dataSourceExists: async () => true,
      columnsHash: async () => mysteryHash,
      primaryKeys: async () => null,
      getCachedColumnsHash: () => mysteryHash,
    };
    const adapter = {
      internalSchemaCache: cache,
      schemaCache: cache,
      lookupCastTypeFromColumn: () => null,
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model.typeForAttribute("mystery")).toBeInstanceOf(ValueType);
  });

  it("invalidates the _attributesBuilder cache", async () => {
    (Model as unknown as { _attributesBuilder?: unknown })._attributesBuilder = {
      stale: true,
    };
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(
      (Model as unknown as { _attributesBuilder: unknown })._attributesBuilder,
    ).toBeUndefined();
  });
});

describe("loadSchemaFromAdapter integration details", () => {
  it("defines prototype accessors so record.column works", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    const rec = new Post();
    rec.writeAttribute("guid", "abc-123");
    expect((rec as unknown as { guid: string }).guid).toBe("abc-123");
  });

  it("skips columns listed in _ignoredColumns (and removes their accessors)", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    (Post as unknown as { _ignoredColumns: string[] })._ignoredColumns = ["secret"];
    Object.defineProperty(Post.prototype, "secret", {
      get() {
        return "leaked";
      },
      configurable: true,
    });

    const adapter = makeAdapter(
      { guid: { sqlType: "uuid" }, secret: { sqlType: "uuid" } },
      { uuid: new UuidType() },
    );
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    expect(Object.keys(Post.columnsHash())).not.toContain("secret");
    expect(Object.getOwnPropertyDescriptor(Post.prototype, "secret")).toBeDefined();
    expect(Object.keys(Post.columnsHash())).toContain("guid");
  });

  it("preserves user-declared defs for ignoredColumns (only strips accessor)", async () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("age", "integer");
      }
    }
    (Post as unknown as { _ignoredColumns: string[] })._ignoredColumns = ["age"];

    const adapter = makeAdapter({ age: { sqlType: "integer" } }, { integer: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    expect(Post.typeForAttribute("age")!.type()).toBe("integer");
    expect(Object.getOwnPropertyDescriptor(Post.prototype, "age")).toBeUndefined();
  });

  it("invalidates _columnsHash and _columns after reflection", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    (Post as unknown as { _columnsHash: unknown })._columnsHash = { stale: true };
    (Post as unknown as { _columns: unknown })._columns = ["stale"];

    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    const columnsHash = (Post as unknown as { _columnsHash: Record<string, unknown> })._columnsHash;
    expect(Object.keys(columnsHash)).toEqual(["guid"]);
    expect((Post as unknown as { _columns: unknown })._columns).toBeUndefined();
  });

  it("does not shadow Base.prototype.id when reflecting an id column", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const adapter = makeAdapter({ id: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    expect(Object.getOwnPropertyDescriptor(Post.prototype, "id")).toBeUndefined();

    const rec = new Post();
    rec.writeAttribute("id", "abc-123");
    expect((rec as unknown as { id: string }).id).toBe("abc-123");
  });

  it("discards the load if the adapter is swapped mid-flight (race guard)", async () => {
    let resolveColumns: (v: Record<string, unknown>) => void = () => {};
    const columnsPromise = new Promise<Record<string, unknown>>((r) => {
      resolveColumns = r;
    });
    const firstCache = {
      dataSourceExists: async () => true,
      columnsHash: () => columnsPromise,
      primaryKeys: async () => null,
    };
    const firstAdapter = {
      internalSchemaCache: firstCache,
      schemaCache: firstCache,
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    const secondAdapter = makeAdapter({}, {});
    const host = {
      adapter: firstAdapter,
      tableName: "posts",
      prototype: {},
    };

    const inflight = (loadSchemaFromAdapter as any).call(host);

    host.adapter = secondAdapter as typeof host.adapter;
    resolveColumns({ guid: { sqlType: "uuid" } });
    await inflight;

    expect(Object.hasOwn(host, "_schemaLoaded")).toBe(false);
    expect(Object.hasOwn(host, "_columnsHash")).toBe(false);
  });
});

describe("set adapter auto-loads schema", () => {
  it("awaiting Base.loadSchema() populates schema-sourced defs end-to-end", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;

    await Post.loadSchema();

    expect(Post.typeForAttribute("guid")!.type()).toBe("uuid");
  });
});
