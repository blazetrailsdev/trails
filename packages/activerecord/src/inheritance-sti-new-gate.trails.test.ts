/**
 * trails-only regression test for the `new()` STI dispatch gate in
 * `subclassFromAttributesForNew`. See inheritance.test.ts for the
 * Rails-mirrored suite.
 *
 * The gate short-circuited on `!_hasAttribute && descendants.length === 0`,
 * which swallowed an STI *leaf* whose `type` column had not reflected yet and
 * which tracks no descendants of its own: it built as-is (and then failed as an
 * unknown attribute) where Rails' `_has_attribute?(inheritance_column)` gate
 * (`inheritance.rb:55`, `subclass_from_attributes`) reaches `find_sti_class`
 * and raises.
 *
 * This lives in its own file, and calls no `fixtures()`, because the defect only
 * exists while reflection is COLD: anything that warms the hierarchy's schema —
 * including a `fixtures()` hook in an earlier describe of the same file — makes
 * `DeadParrot._hasAttribute("parrot_sti_class")` true, at which point even the
 * unpatched gate falls through to the raising resolver and the test passes for
 * the wrong reason. The precondition is asserted below so a future reordering
 * trips loudly rather than silently going green.
 */
import { describe, it, expect } from "vitest";
import { SubclassNotFound } from "./errors.js";
import { DeadParrot } from "./test-helpers/models/parrot.js";

describe("new() STI dispatch gate", () => {
  it("raises SubclassNotFound for a bad type on a cold STI leaf", () => {
    expect(DeadParrot._hasAttribute("parrot_sti_class")).toBe(false);

    expect(() => DeadParrot.new({ parrot_sti_class: "InvalidType" })).toThrow(SubclassNotFound);
  });
});
