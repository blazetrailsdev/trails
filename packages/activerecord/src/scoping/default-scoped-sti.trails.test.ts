/**
 * TS-only coverage for the evaluation ORDER inside `default_scoped`
 * (named.rb:45-47). Ruby's `scope = relation` is a DEFAULT ARGUMENT, so the
 * base relation — STI `type_condition` and all — is built BEFORE
 * `build_default_scope` arms its recursion guard. Hoisting `relation()` out of
 * the default would drop the type condition on an STI subclass whose default
 * scope re-enters the relation, which no ported Rails test isolates.
 */
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
