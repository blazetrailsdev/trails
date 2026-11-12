import { describe, it, expect } from "vitest";
import "../../../lib/index.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { DeveloperwithDefaultMentorScopeNot } from "../../models/developer.js";

describe("Base.all all_queries option", () => {
  fixtures([]);

  it("applies a non-all_queries default scope to all() but not to all({ allQueries: true })", () => {
    const normal = DeveloperwithDefaultMentorScopeNot.all().toSql();
    const allQueries = DeveloperwithDefaultMentorScopeNot.all({ allQueries: true }).toSql();
    expect(normal).toMatch(/mentor_id/);
    expect(allQueries).not.toMatch(/mentor_id/);
  });
});
