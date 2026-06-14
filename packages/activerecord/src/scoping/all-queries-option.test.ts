import { describe, it, expect } from "vitest";
import "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { DeveloperwithDefaultMentorScopeNot } from "../test-helpers/models/developer.js";

// `Base.all(all_queries:)` threads the flag into build_default_scope (mirrors
// ActiveRecord::Base.all). A default scope NOT flagged `all_queries: true`
// applies to ordinary reads but is suppressed when `all_queries: true` is
// requested — the path `_find_record` uses on reload.
describe("Base.all all_queries option", () => {
  useHandlerFixtures([], { schema: canonicalSchema });

  it("applies a non-all_queries default scope to all() but not to all({ allQueries: true })", () => {
    const normal = DeveloperwithDefaultMentorScopeNot.all().toSql();
    const allQueries = DeveloperwithDefaultMentorScopeNot.all({ allQueries: true }).toSql();
    expect(normal).toMatch(/mentor_id/);
    expect(allQueries).not.toMatch(/mentor_id/);
  });
});
