import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPathAsync, getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync, getEnv } from "@blazetrails/activesupport";
import { generateSchemaFile } from "./schema-file-generator.js";
import type { Schema } from "./define-schema.js";

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

  it("emits a single-column integer custom PK via the string primaryKey (serial) form", () => {
    // String `primaryKey` makes createTable generate a serial PK column...
    expect(content).toContain('"gadgets", { primaryKey: "gadget_id" }');
    // ...and the PK column is NOT re-emitted as a plain integer column.
    expect(content).not.toContain('"gadget_id", "integer"');
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

  it("remaps date, time, json columns to string (VARCHAR)", () => {
    expect(content).toContain('"occurred_on", "string"');
    expect(content).toContain('"scheduled_time", "string"');
    expect(content).toContain('"metadata", "string"');
    expect(content).not.toContain('"date"');
    expect(content).not.toContain('"time"');
    expect(content).not.toContain('"json"');
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
