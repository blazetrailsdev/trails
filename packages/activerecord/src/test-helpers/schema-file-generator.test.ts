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
});
