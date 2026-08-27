import { describe, it, expect, beforeEach } from "vitest";
import { ValueType, typeRegistry } from "@blazetrails/activemodel";
type Type = ValueType;
import { Base } from "./base.js";
import { loadSchemaFromAdapter } from "./model-schema.js";

/** The names a class declared with `attribute()` — the `name`s on its own
 * pending-modification queue (activemodel attribute_registration.rb:17-18,77-78),
 * which holds user declarations only and never schema-sourced columns. */
const declared = (klass: unknown): string[] => {
  if (!Object.hasOwn(klass as object, "_pendingAttributeModifications")) return [];
  return (
    klass as { _pendingAttributeModifications: { name?: string }[] }
  )._pendingAttributeModifications
    .map((modification) => modification.name)
    .filter((name): name is string => name !== undefined);
};

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
    internalSchemaCache: {
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

    // A reflected column lives in `columns_hash` and reaches the attribute set
    // through `_default_attributes`' seed (attributes.rb:241-245) — never
    // through a class-level registry, which holds user declarations only.
    expect(Model.typeForAttribute("guid").name).toBe("uuid");
    expect(Model.typeForAttribute("payload").name).toBe("jsonb");
    expect(declared(Model)).not.toContain("guid");
  });

  it("does not overwrite user-declared attributes", async () => {
    Model.attribute("guid", "string");
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model.typeForAttribute("guid").name).toBe("string");
    expect(declared(Model)).toContain("guid");
  });

  it("is a no-op for abstract classes", async () => {
    (Model as unknown as { _abstractClass: boolean })._abstractClass = true;
    const adapter = makeAdapter({ guid: { sqlType: "uuid" } }, { uuid: new UuidType() });
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(declared(Model)).not.toContain("guid");
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
    const adapter = {
      internalSchemaCache: {
        dataSourceExists: async () => false,
        columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      },
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(declared(Model)).not.toContain("guid");
  });

  it("falls through when dataSourceExists returns undefined (probe not implemented)", async () => {
    const adapter = {
      internalSchemaCache: {
        dataSourceExists: async () => undefined,
        columnsHash: async () => ({ guid: { sqlType: "uuid" } }),
      },
      lookupCastTypeFromColumn: () => new UuidType(),
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(declared(Model)).not.toContain("guid");
  });

  it("falls back to ValueType when adapter has no cast type", async () => {
    const mysteryHash = { mystery: { sqlType: "weird" } };
    const adapter = {
      internalSchemaCache: {
        dataSourceExists: async () => true,
        columnsHash: async () => mysteryHash,
        getCachedColumnsHash: () => mysteryHash,
      },
      lookupCastTypeFromColumn: () => null,
    };
    (Model as unknown as { adapter: unknown }).adapter = adapter;

    await loadSchemaFromAdapter.call(Model);

    expect(Model.typeForAttribute("mystery")).toBeInstanceOf(
      typeRegistry.lookup("value").constructor,
    );
    expect(declared(Model)).not.toContain("mystery");
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
    // The schema-sourced def is dropped, but an accessor that already exists
    // survives: `load_schema!` defines and undefines no methods, and
    // `ignored_columns=` (model_schema.rb:366-369) calls only
    // `reload_schema_from_cache` — only `reset_column_information` (:523-530)
    // undefines attribute methods.
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

    // User-declared def survives ignoredColumns.
    expect(declared(Post)).toContain("age");
    expect(declared(Post)).toContain("age");
    // Accessor stripped.
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
    expect(declared(Post)).not.toContain("id");

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
      internalSchemaCache: {
        dataSourceExists: async () => true,
        columnsHash: () => columnsPromise,
      },
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

    expect(declared(host)).not.toContain("guid");
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

    expect(Post.typeForAttribute("guid").name).toBe("uuid");
    expect(declared(Post)).not.toContain("guid");
  });
});
