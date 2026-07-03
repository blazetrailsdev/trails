import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPathAsync, getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync, getEnv } from "@blazetrails/activesupport";
import { generateSchemaFile } from "./schema-file-generator.js";
import type {
  Schema,
  ColumnSpec,
  AnyPrimitiveColumnSpec,
  PrimitiveColumnSpec,
} from "./define-schema.js";
import {
  COLUMN_TYPE_MAP_PG,
  COLUMN_TYPE_MAP_MYSQL,
  COLUMN_TYPE_MAP_SQLITE,
  serialIdType,
} from "./define-schema.js";

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
  // Single-column integer custom PK → serial (Rails `t.primary_key :gadget_id`).
  gadgets: {
    columns: { gadget_id: "integer", name: "string" },
    primaryKey: ["gadget_id"],
  },
  // Single-column STRING custom PK → stays the array form (not serial).
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
    } catch {
      /* already gone */
    }
  });

  it("writes file to os.tmpdir keyed by VITEST_POOL_ID", async () => {
    const [os, path] = await Promise.all([getOsAsync(), getPathAsync()]);
    const poolId = getEnv("VITEST_POOL_ID") ?? "0";
    expect(filePath).toContain(path.join(os.tmpdir(), `trails-schema-${poolId}-`));
    expect(filePath).toMatch(/\.ts$/);
    const fs = await getFsAsync();
    expect(await fs.exists(filePath)).toBe(true);
  });

  it("exports a default async function accepting MigrationContext", () => {
    expect(content).toContain("export default async function defineSchema");
    expect(content).toContain("MigrationContext");
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

  it("handles primaryKey:false, composite PK, and null:false on CPK columns", () => {
    expect(content).toContain('"drafts", { id: false }');
    expect(content).toContain('primaryKey: ["book_id","edition_num"]');
    expect(content).toContain('"book_id", "integer", { null: false }');
    expect(content).toContain('"edition_num", "integer", { null: false }');
  });

  it("does not emit force:cascade for non-mysql/pg adapters", () => {
    expect(content).not.toContain('force: "cascade"');
  });

  it("emits a single-column integer custom PK inline at its declared offset (serial)", () => {
    // `id: false` suppresses the auto id; the serial PK column is emitted inline
    // at its declared offset with an INT-width serial type (default → "integer")
    // so its reflected position matches Rails (mirrors define-schema.ts).
    expect(content).toContain('"gadgets", { id: false }');
    expect(content).toContain('"gadget_id", "integer", { primaryKey: true }');
    // The non-PK column is still emitted.
    expect(content).toContain('"name", "string"');
  });

  it("keeps a single-column string custom PK as the array (non-serial) form", () => {
    expect(content).toContain('primaryKey: ["code"]');
    // The string PK column is still emitted as a column (NOT NULL via composite path).
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
    filePath = await generateSchemaFile(MYSQL_SCHEMA, "mysql");
    const fs = await getFsAsync();
    content = fs.readFileSync(filePath, "utf-8");
  });

  afterAll(async () => {
    const fs = await getFsAsync();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already gone */
    }
  });

  it("emits native date, time, json column types (matching define-schema.ts)", () => {
    // define-schema.ts COLUMN_TYPE_MAP_MYSQL maps date/time/json to their
    // native MySQL types (PR #4141) so DATE/TIME/JSON columns round-trip as
    // PlainDate/PlainTime/parsed-JSON instead of raw strings. The generator
    // must agree, or the boot-laid canonical schema lays these as VARCHAR and
    // schema loading never registers them for casting.
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
    const filePath = await generateSchemaFile(SCHEMA, "mysql");
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
    const filePath = await generateSchemaFile(SCHEMA, "mysql");
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

// PARITY GUARD — schema-file-generator.ts's per-adapter type mapping is a
// parallel re-implementation of define-schema.ts's COLUMN_TYPE_MAP_* /
// serialIdType. A one-sided edit reintroduces silent drift: PR #4461 fixed a
// MariaDB regression where the generator's stale SCHEMA_TO_AR_MYSQL still
// remapped date/time/json → string, even though define-schema.ts's map had
// been converged to native MySQL types by PR #4141 — so boot-laid canonical
// `topics.last_read` was created as varchar(255) instead of date. This guard
// drives the generator for a schema covering every PrimitiveColumnSpec on each
// adapter and asserts the emitted `t.column(name, "type", …)` matches the
// authoritative COLUMN_TYPE_MAP_* the fixtures path (define-schema.ts) uses.
describe("generateSchemaFile / define-schema.ts type-map parity", () => {
  // Extract the emitted AR type for each column from a generated schema file:
  // matches `t.column("colName", "arType", …)`.
  function emittedTypes(content: string): Record<string, string> {
    const out: Record<string, string> = {};
    const re = /t\.column\("([^"]+)", "([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) out[m[1]] = m[2];
    return out;
  }

  // One column per key, named after the primitive so we can look it up.
  function schemaFor(types: readonly AnyPrimitiveColumnSpec[]): Schema {
    const columns: Record<string, ColumnSpec> = {};
    for (const t of types) columns[`c_${t}`] = t;
    return { parity_probe: columns };
  }

  const CASES: ReadonlyArray<{
    adapter: string;
    map: Record<string, string>;
  }> = [
    { adapter: "postgres", map: COLUMN_TYPE_MAP_PG },
    { adapter: "mysql", map: COLUMN_TYPE_MAP_MYSQL },
    { adapter: "sqlite", map: COLUMN_TYPE_MAP_SQLITE },
  ];

  for (const { adapter, map } of CASES) {
    it(`emits the same column type as COLUMN_TYPE_MAP for every primitive on ${adapter}`, async () => {
      const primitives = Object.keys(map) as AnyPrimitiveColumnSpec[];
      const filePath = await generateSchemaFile(schemaFor(primitives), adapter);
      const fs = await getFsAsync();
      const content = fs.readFileSync(filePath, "utf-8");
      const emitted = emittedTypes(content);
      for (const primitive of primitives) {
        expect(emitted[`c_${primitive}`], `${adapter} type for "${primitive}"`).toBe(
          map[primitive],
        );
      }
      fs.unlinkSync(filePath);
    });
  }

  it("injects precision:6 on MySQL bare datetime columns (mirrors define-schema.ts)", async () => {
    const filePath = await generateSchemaFile({ parity_probe: { at: "datetime" } }, "mysql");
    const fs = await getFsAsync();
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('t.column("at", "datetime", { precision: 6 })');
    fs.unlinkSync(filePath);
  });

  it("does not inject precision on non-MySQL datetime columns", async () => {
    for (const adapter of ["postgres", "sqlite"]) {
      const filePath = await generateSchemaFile({ parity_probe: { at: "datetime" } }, adapter);
      const fs = await getFsAsync();
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain('t.column("at", "datetime", {})');
      fs.unlinkSync(filePath);
    }
  });

  it("emits serial-PK width matching serialIdType for every adapter", async () => {
    for (const adapter of ["postgres", "mysql", "sqlite"]) {
      for (const type of ["integer", "big_integer"] as PrimitiveColumnSpec[]) {
        const schema: Schema = {
          parity_probe: { columns: { pk: type }, primaryKey: ["pk"] },
        };
        const filePath = await generateSchemaFile(schema, adapter);
        const fs = await getFsAsync();
        const content = fs.readFileSync(filePath, "utf-8");
        const want = serialIdType(type, adapter);
        expect(content, `${adapter} serial PK for "${type}"`).toContain(
          `t.column("pk", "${want}", { primaryKey: true })`,
        );
        fs.unlinkSync(filePath);
      }
    }
  });
});
