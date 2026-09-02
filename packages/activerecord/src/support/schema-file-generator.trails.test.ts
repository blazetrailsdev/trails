import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPathAsync, getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync, getEnv } from "@blazetrails/activesupport";
import { generateSchemaFile } from "./schema-file-generator.js";
import type {
  Schema,
  ColumnSpec,
  AnyPrimitiveColumnSpec,
  PrimitiveColumnSpec,
  IndexSpec,
} from "./schema-types.js";
import {
  COLUMN_TYPE_MAP_PG,
  COLUMN_TYPE_MAP_MYSQL,
  COLUMN_TYPE_MAP_SQLITE,
  serialIdType,
} from "./schema-types.js";
import { emitTableIndexes } from "./canonical-schema.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { AddIndexOptions } from "../connection-adapters/abstract/schema-definitions.js";

const MINI_SCHEMA: Schema = {
  authors: { name: "string" },
  books: {
    title: "string",
    author_id: { type: "integer", null: false },
    published_at: { type: "datetime", precision: null, defaultFunction: "CURRENT_TIMESTAMP" },
    page_count: { type: "big_integer", default: 0 },
  },
  editions: {
    columns: { book_id: "integer", edition_num: "integer" },
    primaryKey: ["book_id", "edition_num"],
  },
  drafts: { columns: {}, primaryKey: false },
  gadgets: {
    columns: { gadget_id: "integer", name: "string" },
    primaryKey: ["gadget_id"],
  },
  registries: {
    columns: { code: "string", label: "string" },
    primaryKey: ["code"],
  },
};

describe("generateSchemaFile", () => {
  let filePath: string;
  let content: string;

  beforeAll(async () => {
    filePath = await generateSchemaFile(MINI_SCHEMA);
    const fs = await getFsAsync();
    content = fs.readFileSync(filePath, "utf-8");
  });

  afterAll(async () => {
    const fs = await getFsAsync();
    try {
      fs.unlinkSync(filePath);
    } catch {}
  });

  it("writes file to os.tmpdir keyed by VITEST_POOL_ID", async () => {
    const [os, path] = await Promise.all([getOsAsync(), getPathAsync()]);
    const poolId = getEnv("VITEST_POOL_ID") ?? "0";
    expect(filePath).toContain(path.join(os.tmpdir(), `trails-schema-${poolId}-`));
    expect(filePath).toMatch(/\.ts$/);
    const fs = await getFsAsync();
    expect(await fs.exists(filePath)).toBe(true);
  });

  it("exports a default async function accepting DatabaseAdapter", () => {
    expect(content).toContain("export default async function defineSchema");
    expect(content).toContain("DatabaseAdapter");
  });

  it("emits createTable for every table in the schema", () => {
    for (const table of Object.keys(MINI_SCHEMA)) {
      expect(content).toContain(JSON.stringify(table));
    }
  });

  it("maps big_integer to bigint and emits defaultFunction as a lambda", () => {
    expect(content).toContain('"bigint"');
    expect(content).not.toContain('"big_integer"');
    expect(content).toContain('default: () => "CURRENT_TIMESTAMP"');
  });

  it("handles primaryKey:false and composite PK", () => {
    expect(content).toContain('"drafts", { id: false }');
    expect(content).toContain('primaryKey: ["book_id","edition_num"]');
    expect(content).toContain('"book_id", "integer", {}');
    expect(content).toContain('"edition_num", "integer", {}');
  });

  it("does not emit force:cascade for non-mysql/pg adapters", () => {
    expect(content).not.toContain('force: "cascade"');
  });

  it("emits a single-column integer custom PK inline at its declared offset (serial)", () => {
    expect(content).toContain('"gadgets", { id: false }');
    expect(content).toContain('"gadget_id", "integer", { primaryKey: true }');
    expect(content).toContain('"name", "string"');
  });

  it("keeps a single-column string custom PK as the array (non-serial) form", () => {
    expect(content).toContain('primaryKey: ["code"]');
    expect(content).toContain('"code", "string"');
  });
});

const MYSQL_SCHEMA: Schema = {
  events: {
    occurred_on: "date",
    started_at: "datetime",
    window_open: { type: "datetime", precision: 3 },
    legacy_ts: { type: "datetime", precision: null, defaultFunction: "CURRENT_TIMESTAMP" },
    scheduled_time: "time",
    metadata: "json",
    description: "string",
  },
};

describe("generateSchemaFile (MySQL adapter)", () => {
  let content: string;
  let filePath: string;

  beforeAll(async () => {
    filePath = await generateSchemaFile(MYSQL_SCHEMA, "mysql2");
    const fs = await getFsAsync();
    content = fs.readFileSync(filePath, "utf-8");
  });

  afterAll(async () => {
    const fs = await getFsAsync();
    try {
      fs.unlinkSync(filePath);
    } catch {}
  });

  it("emits native date, time, json column types (matching define-schema.ts)", () => {
    expect(content).toContain('"occurred_on", "date"');
    expect(content).toContain('"scheduled_time", "time"');
    expect(content).toContain('"metadata", "json"');
  });

  it("injects precision:6 for bare datetime columns", () => {
    expect(content).toContain('"started_at", "datetime", { precision: 6 }');
  });

  it("does not override explicit precision on datetime", () => {
    expect(content).toContain('"window_open", "datetime", { precision: 3 }');
    expect(content).not.toContain('"window_open", "datetime", { precision: 6 }');
  });

  it("does not inject precision:6 when precision is null (opts out)", () => {
    expect(content).toContain('"legacy_ts", "datetime", { precision: null');
    expect(content).not.toContain('"legacy_ts", "datetime", { precision: 6 }');
  });

  it("leaves non-date/json types unchanged", () => {
    expect(content).toContain('"description", "string"');
  });

  it("emits force:cascade on createTable for per-table drop+recreate on shared DB", () => {
    expect(content).toContain('force: "cascade"');
  });
});

const FK_SCHEMA: Schema = {
  fk_test_has_pk: { columns: { pk_id: { type: "integer", null: false } }, primaryKey: ["pk_id"] },
  fk_test_has_fk: {
    columns: { fk_id: { type: "integer", null: false } },
    foreignKeys: [
      { toTable: "fk_test_has_pk", column: "fk_id", primaryKey: "pk_id", name: "fk_name" },
    ],
  },
};

describe("generateSchemaFile foreign keys", () => {
  const written: string[] = [];

  const generate = async (typeRegistryKey?: string): Promise<string> => {
    const filePath = await generateSchemaFile(FK_SCHEMA, typeRegistryKey);
    written.push(filePath);
    return (await getFsAsync()).readFileSync(filePath, "utf-8");
  };

  afterAll(async () => {
    const fs = await getFsAsync();
    for (const filePath of written) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  });

  it("emits t.foreignKey inside the create-table block", async () => {
    const content = await generate();
    expect(content).toContain(
      '    t.foreignKey("fk_test_has_pk", {"column":"fk_id","primaryKey":"pk_id","name":"fk_name"});',
    );
  });

  it("drops referencing tables up front on the force-recreate adapters", async () => {
    const content = await generate("postgres");
    const drop = content.indexOf('ctx.dropTable("fk_test_has_fk", { ifExists: true })');
    const createParent = content.indexOf('ctx.createTable("fk_test_has_pk"');
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(createParent);
  });
});

describe("generateSchemaFile single-column integer PK id type per adapter", () => {
  const SCHEMA: Schema = {
    gadgets: { columns: { gadget_id: "integer", name: "string" }, primaryKey: ["gadget_id"] },
  };

  it("uses serial on postgres (INT4 serial, not the bigint primary_key type)", async () => {
    const filePath = await generateSchemaFile(SCHEMA, "postgres");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"gadget_id", "serial", { primaryKey: true }');
    fs.unlinkSync(filePath);
  });

  it("uses integer (INT auto-increment) on mysql, not bigint", async () => {
    const filePath = await generateSchemaFile(SCHEMA, "mysql2");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"gadget_id", "integer", { primaryKey: true }');
    fs.unlinkSync(filePath);
  });
});

describe("generateSchemaFile single-column big_integer PK id type per adapter", () => {
  const SCHEMA: Schema = {
    widgets: { columns: { widget_id: "big_integer", name: "string" }, primaryKey: ["widget_id"] },
  };

  it("uses bigserial on postgres (INT8 serial, not the plain bigint primary_key type)", async () => {
    const filePath = await generateSchemaFile(SCHEMA, "postgres");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"widget_id", "bigserial", { primaryKey: true }');
    fs.unlinkSync(filePath);
  });

  it("uses bigint (BIGINT auto-increment) on mysql", async () => {
    const filePath = await generateSchemaFile(SCHEMA, "mysql2");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"widget_id", "bigint", { primaryKey: true }');
    fs.unlinkSync(filePath);
  });

  it("uses integer (rowid auto-increment) on sqlite", async () => {
    const filePath = await generateSchemaFile(SCHEMA, "sqlite");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('"widget_id", "integer", { primaryKey: true }');
    fs.unlinkSync(filePath);
  });
});

describe("generateSchemaFile / define-schema.ts type-map parity", () => {
  async function readGenerated(schema: Schema, adapter: string): Promise<string> {
    const filePath = await generateSchemaFile(schema, adapter);
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    fs.unlinkSync(filePath);
    return content;
  }

  function emittedTypes(content: string): Record<string, string> {
    const out: Record<string, string> = {};
    const re = /t\.column\("([^"]+)", "([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out[m[1]] = m[2];
    return out;
  }

  function schemaFor(types: readonly AnyPrimitiveColumnSpec[]): Schema {
    const columns: Record<string, ColumnSpec> = {};
    for (const t of types) columns[`c_${t}`] = t;
    return { parity_probe: columns };
  }

  const CASES: ReadonlyArray<{
    adapter: string;
    map: Record<string, string>;
  }> = [
    { adapter: "postgresql", map: COLUMN_TYPE_MAP_PG },
    { adapter: "mysql2", map: COLUMN_TYPE_MAP_MYSQL },
    { adapter: "sqlite3", map: COLUMN_TYPE_MAP_SQLITE },
  ];

  for (const { adapter, map } of CASES) {
    it(`emits the same column type as COLUMN_TYPE_MAP for every primitive on ${adapter}`, async () => {
      const primitives = Object.keys(map) as AnyPrimitiveColumnSpec[];
      const emitted = emittedTypes(await readGenerated(schemaFor(primitives), adapter));
      for (const primitive of primitives) {
        expect(emitted[`c_${primitive}`], `${adapter} type for "${primitive}"`).toBe(
          map[primitive],
        );
      }
    });
  }

  it("emits native date/time/json (not string) on MySQL — the PR #4461 regression", async () => {
    const emitted = emittedTypes(
      await readGenerated(schemaFor(["date", "time", "json"]), "mysql2"),
    );
    expect(emitted["c_date"]).toBe("date");
    expect(emitted["c_time"]).toBe("time");
    expect(emitted["c_json"]).toBe("json");
  });

  it("injects precision:6 on MySQL bare datetime columns (mirrors define-schema.ts)", async () => {
    const content = await readGenerated({ parity_probe: { at: "datetime" } }, "mysql2");
    expect(content).toContain('t.column("at", "datetime", { precision: 6 })');
  });

  it("does not inject precision on non-MySQL datetime columns", async () => {
    for (const adapter of ["postgres", "sqlite"]) {
      const content = await readGenerated({ parity_probe: { at: "datetime" } }, adapter);
      expect(content).toContain('t.column("at", "datetime", {})');
    }
  });

  it("emits serial-PK width matching serialIdType for every adapter", async () => {
    for (const adapter of ["postgres", "mysql2", "sqlite"]) {
      for (const type of ["integer", "big_integer"] as PrimitiveColumnSpec[]) {
        const schema: Schema = {
          parity_probe: { columns: { pk: type }, primaryKey: ["pk"] },
        };
        const content = await readGenerated(schema, adapter);
        const want = serialIdType(type, adapter);
        expect(content, `${adapter} serial PK for "${type}"`).toContain(
          `t.column("pk", "${want}", { primaryKey: true })`,
        );
      }
    }
  });
});

type RecordedIndex = { columns: string | string[]; options: Record<string, unknown> };

function makeIndexRecorder(): { recorded: RecordedIndex[]; ctx: Record<string, unknown> } {
  const recorded: RecordedIndex[] = [];
  const noopTable = { column: () => {} };
  const ctx: Record<string, unknown> = {
    dropTable: async () => {},
    createTable: async (_name: string, _opts: unknown, cb?: (t: typeof noopTable) => void) => {
      cb?.(noopTable);
    },
    addIndex: async (
      _table: string,
      columns: string | string[],
      options: Record<string, unknown>,
    ) => {
      recorded.push({ columns, options });
    },
  };
  return { recorded, ctx };
}

function normalizeIndexOptions(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options)) if (v !== undefined) out[k] = v;
  return out;
}

function normalizeRecorded(recorded: RecordedIndex[]): string {
  return JSON.stringify(
    recorded.map((r) => ({ columns: r.columns, options: normalizeIndexOptions(r.options) })),
  );
}

async function generatorIndexes(
  schema: Schema,
  adapter: string,
  supportsExpressionIndex?: boolean,
): Promise<RecordedIndex[]> {
  const filePath = await generateSchemaFile(schema, adapter, supportsExpressionIndex);
  const path = await getPathAsync();
  const href = path.pathToFileURL!(filePath).href;
  const mod = (await import(href)) as { default: (ctx: unknown) => Promise<void> };
  const { recorded, ctx } = makeIndexRecorder();
  await mod.default(ctx);
  const fs = await getFsAsync();
  fs.unlinkSync(filePath);
  return recorded;
}

async function canonicalIndexes(
  indexes: Parameters<typeof emitTableIndexes>[3],
  adapter: string,
  supportsExpressionIndex: boolean,
): Promise<RecordedIndex[]> {
  const { recorded, ctx } = makeIndexRecorder();
  const ss = ctx as unknown as {
    addIndex(table: string, columns: string | string[], options: AddIndexOptions): Promise<void>;
  };
  const fakeAdapter = {
    typeRegistryKey: adapter,
    supportsExpressionIndex: () => supportsExpressionIndex,
    getDatabaseVersion: async () => {},
  } as unknown as AbstractAdapter;
  await emitTableIndexes(ss, fakeAdapter, "parity_probe", indexes);
  return recorded;
}

const PARITY_INDEXES: Parameters<typeof emitTableIndexes>[3] = [
  { columns: "title", opts: { unique: true, name: "idx_probe_title", where: "rating > 0" } },
  { columns: ["title", "rating"], opts: { order: { rating: "desc" }, length: { title: 10 } } },
  {
    columns: "rating",
    opts: { length: 8, using: "btree", type: "btree", nullsNotDistinct: true },
  },
  { columns: "(lower(external_id))", opts: {} },
  { columns: "body", opts: { name: "idx_probe_mysql_only", adapters: ["mysql2"] } },
];
const PARITY_EXPRESSION_INDEX = "(lower(external_id))";
const GENERATOR_INDEXES: IndexSpec[] = PARITY_INDEXES.map((i) => ({
  columns: i.columns,
  ...i.opts,
}));
const GENERATOR_SCHEMA: Schema = {
  parity_probe: {
    columns: {
      title: "string",
      rating: "integer",
      body: "text",
      external_id: "string",
    },
    indexes: GENERATOR_INDEXES,
  },
};

describe("generateSchemaFile / canonical-schema.ts index-gating parity", () => {
  for (const adapter of ["postgres", "sqlite"] as const) {
    it(`emits the same addIndex calls as canonical-schema.ts on ${adapter}`, async () => {
      const [gen, canon] = await Promise.all([
        generatorIndexes(GENERATOR_SCHEMA, adapter),
        canonicalIndexes(PARITY_INDEXES, adapter, true),
      ]);
      expect(gen).toHaveLength(PARITY_INDEXES.length - 1);
      expect(normalizeRecorded(gen)).toBe(normalizeRecorded(canon));
    });
  }

  it("emits the same addIndex calls as canonical-schema.ts on mysql (MariaDB, no expression index)", async () => {
    const [gen, canon] = await Promise.all([
      generatorIndexes(GENERATOR_SCHEMA, "mysql2"),
      canonicalIndexes(PARITY_INDEXES, "mysql2", false),
    ]);
    expect(gen).toHaveLength(PARITY_INDEXES.length - 1);
    expect(normalizeRecorded(gen)).toBe(normalizeRecorded(canon));
    expect(gen.some((r) => r.options.length !== undefined)).toBe(true);
    expect(gen.some((r) => r.columns === PARITY_EXPRESSION_INDEX)).toBe(false);
  });

  it("passes sub-part index length: through on non-MySQL adapters (both emitters)", async () => {
    for (const adapter of ["postgres", "sqlite"] as const) {
      const [gen, canon] = await Promise.all([
        generatorIndexes(GENERATOR_SCHEMA, adapter),
        canonicalIndexes(PARITY_INDEXES, adapter, true),
      ]);
      expect(gen.some((r) => r.options.length !== undefined)).toBe(true);
      expect(canon.some((r) => normalizeIndexOptions(r.options).length !== undefined)).toBe(true);
    }
  });

  it("emits the same addIndex calls as canonical-schema.ts on mysql 8 (expression index kept)", async () => {
    const [gen, canonMysql8] = await Promise.all([
      generatorIndexes(GENERATOR_SCHEMA, "mysql2", true),
      canonicalIndexes(PARITY_INDEXES, "mysql2", true),
    ]);
    expect(gen).toHaveLength(PARITY_INDEXES.length);
    expect(gen.some((r) => r.columns === PARITY_EXPRESSION_INDEX)).toBe(true);
    expect(normalizeRecorded(gen)).toBe(normalizeRecorded(canonMysql8));
  });
});
