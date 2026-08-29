import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "./index.js";

import { fixtures } from "./test-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("column_names sync virtual exclusion", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(async () => {
    const conn = Base.connection as unknown as {
      internalSchemaCache: { columnsHash(pool: unknown, table: string): Promise<unknown> };
      pool: unknown;
    };
    await conn.internalSchemaCache.columnsHash(conn.pool, "posts");
  });

  it("excludes virtual attributes from a synchronous column_names on a cold model", () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
        this.attribute("virtual_note", "string");
      }
    }

    const columnNames = (Post as unknown as { columnNames(): string[] }).columnNames();

    expect(columnNames).toContain("title");
    expect(columnNames).toContain("body");
    expect(columnNames).not.toContain("virtual_note");
  });

  it("keeps the virtual attribute in attribute_names", () => {
    class Post extends Base {
      static override tableName = "posts";
      static {
        this.attribute("title", "string");
        this.attribute("virtual_note", "string");
      }
    }

    const columnNames = (Post as unknown as { columnNames(): string[] }).columnNames();
    const attributeNames = (Post as unknown as { attributeNames(): string[] }).attributeNames();

    expect(columnNames).not.toContain("virtual_note");
    expect(attributeNames).toContain("virtual_note");
    expect(new Set(attributeNames)).toEqual(new Set([...columnNames, "virtual_note"]));
  });
});
