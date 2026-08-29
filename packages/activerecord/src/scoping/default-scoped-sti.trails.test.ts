import { describe, it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { SpecialComment } from "../test-helpers/models/comment.js";

describe("defaultScoped on an STI subclass", () => {
  fixtures([]);

  it("keeps the type condition alongside the default scope", () => {
    const sql = SpecialComment.defaultScoped().toSql();

    expect(sql).toMatch(/["`]type["`]\s+IN\s*\(/i);
    expect(sql).toContain("SpecialComment");
    expect(sql).toMatch(/["`]deleted_at["`]\s+IS\s+NULL/i);
  });
});
