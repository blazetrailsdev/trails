import { describe, it, expect, beforeEach } from "vitest";
import { ValueType, typeRegistry } from "@blazetrails/activemodel";
type Type = ValueType;
import { Base } from "./base.js";
import { loadSchemaFromAdapter } from "./model-schema.js";

class UuidType extends ValueType {
  override readonly name = "uuid" as unknown as "value";
}

class JsonbType extends ValueType {
  override readonly name = "jsonb" as unknown as "value";
}

function makeAdapter(
  columns: Record<string, { sqlType: string; default?: unknown }>,
  typeByColumn: Record<string, Type>,
): unknown {
  const hash = columns as unknown as Record<string, unknown>;
  return {
    schemaCache: {
      dataSourceExists: async () => true,
      columnsHash: async () => hash,
      getCachedColumnsHash: () => hash,
      isCached: () => true,
    },
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

    const guid = Model._attributeDefinitions.get("guid");
    const payload = Model._attributeDefinitions.get("payload");
    expect(guid?.type.name).toBe("uuid");
    expect(guid?.userProvided).toBe(false);
    expect(guid?.source).toBe("schema");
    expect(payload?.type.name).toBe("jsonb");
  });

  it("does not overwrite user-declared attributes", async () => {
    Model.attribute("guid", "string");
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    const def = Model._attributeDefinitions.get("guid");
    expect(def?.type.name).toBe("string");
    expect(def?.userProvided).toBe(true);
    expect(def?.source).toBe("user");
  });

  it("is a no-op for abstract classes", async () => {
    (Model as unknown as { _abstractClass: boolean })._abstractClass = true;
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model._attributeDefinitions.has("guid")).toBe(false);
  });

  it("is a no-op when data source does not exist (explicit false)", async () => {
    const adapter = {
      schemaCache: {
        dataSourceExists: async () => false,
        columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      },
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model._attributeDefinitions.has("guid")).toBe(false);
  });

  it("falls through when dataSourceExists returns undefined (probe not implemented)", async () => {
    const adapter = {
      schemaCache: {
        dataSourceExists: async () => undefined,
        columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      },
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model._attributeDefinitions.get("guid")?.source).toBe("schema");
  });

  it("falls back to ValueType when adapter has no cast type", async () => {
    const adapter = {
      schemaCache: {
        dataSourceExists: async () => true,
        columnsHash: async () => ({ mystery: { sqlType: "weird" } }),
      },
      lookupCastTypeFromColumn: () => null,
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    const def = Model._attributeDefinitions.get("mystery");
    expect(def?.type).toBeInstanceOf(typeRegistry.lookup("value").constructor);
    expect(def?.source).toBe("schema");
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

    expect(Post._attributeDefinitions.has("secret")).toBe(false);
    expect(Object.getOwnPropertyDescriptor(Post.prototype, "secret")).toBeUndefined();
    expect(Post._attributeDefinitions.has("guid")).toBe(true);
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

    expect((Post as unknown as { _columnsHash: unknown })._columnsHash).toBeUndefined();
    expect((Post as unknown as { _columns: unknown })._columns).toBeUndefined();
  });

  it("treats externally-constructed defs without userProvided as user-authored (no overwrite)", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    // Simulate a downstream-style def that predates the userProvided field.
    (Post as unknown as { _attributeDefinitions: Map<string, unknown> })._attributeDefinitions =
      new Map([
        [
          "guid",
          {
            name: "guid",
            type: typeRegistry.lookup("string"),
            defaultValue: null,
          },
        ],
      ]);

    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    const def = Post._attributeDefinitions.get("guid");
    expect(def?.type.name).toBe("string");
  });

  it("does not shadow Base.prototype.id when reflecting an id column", async () => {
    class Post extends Base {
      static override tableName = "posts";
    }
    const adapter = makeAdapter({ id: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Post as unknown as { adapter: unknown }).adapter = adapter;
    await Post.loadSchema();

    expect(Object.getOwnPropertyDescriptor(Post.prototype, "id")).toBeUndefined();
    expect(Post._attributeDefinitions.get("id")?.source).toBe("schema");

    const rec = new Post();
    rec.writeAttribute("id", "abc-123");
    expect((rec as unknown as { id: string }).id).toBe("abc-123");
  });

  it("discards the load if the adapter is swapped mid-flight (race guard)", async () => {
    // Plain host object — avoids Base's adapter getter/setter side effects.
    let resolveColumns: (v: Record<string, unknown>) => void = () => {};
    const columnsPromise = new Promise<Record<string, unknown>>((r) => {
      resolveColumns = r;
    });
    const firstAdapter = {
      schemaCache: {
        dataSourceExists: async () => true,
        columnsHash: () => columnsPromise,
      },
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    const secondAdapter = makeAdapter({}, {});
    const host = {
      adapter: firstAdapter,
      tableName: "posts",
      _attributeDefinitions: new Map(),
      prototype: {},
    };

    const inflight = (loadSchemaFromAdapter as any).call(host);

    host.adapter = secondAdapter as unknown as typeof host.adapter;
    resolveColumns({ guid: { sqlType: "uuid" } });
    await inflight;

    expect(host._attributeDefinitions.has("guid")).toBe(false);
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

    const def = Post._attributeDefinitions.get("guid");
    expect(def?.type.name).toBe("uuid");
    expect(def?.source).toBe("schema");
  });
});

describe("attribute() userProvidedDefault option", () => {
  it("defaults to userProvided=true (source=user)", () => {
    class Foo extends Base {}
    Foo.attribute("name", "string");
    const def = Foo._attributeDefinitions.get("name");
    expect(def?.userProvided).toBe(true);
    expect(def?.source).toBe("user");
  });

  it("sets userProvided=false when userProvidedDefault:false is passed", () => {
    class Foo extends Base {}
    Foo.attribute("name", "string", { userProvidedDefault: false } as {
      userProvidedDefault?: boolean;
    });
    const def = Foo._attributeDefinitions.get("name");
    expect(def?.userProvided).toBe(false);
    expect(def?.source).toBe("schema");
  });
});
