/**
 * TS-only extras for strong-parameters protection — no counterpart in
 * activerecord/test/cases/forbidden_attributes_protection_test.rb, which covers
 * construction, `create_with`, and `where` but never `#update` / `#update!`.
 *
 * Rails' `#update` / `#update!` delegate to `assign_attributes` inside the
 * transaction (persistence.rb:563-579), which runs the empty-bag guard and
 * `sanitize_for_mass_assignment` (attribute_assignment.rb:32-34). trails
 * replaces only `_assign_attributes` with a raw writeAttribute loop (to keep
 * original error classes), so these lock in that the guards Rails runs BEFORE
 * that loop still apply — otherwise an un-permitted params object mass-assigns
 * through `update` unchecked.
 */
import { describe, it, expect } from "vitest";
import { ForbiddenAttributesError } from "@blazetrails/activemodel";
// Side-effect: registers the Relation constructor on Base.
import "./index.js";
import { Person } from "./test-helpers/models/person.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { ProtectedParams } from "./test-helpers/protected-params.js";

describe("ForbiddenAttributesProtectionUpdateTest", () => {
  fixtures(["people"]);

  it("forbidden attributes cannot be used for update", async () => {
    const person = await Person.first();
    await expect(person!.update(new ProtectedParams({ first_name: "Guille" }))).rejects.toThrow(
      ForbiddenAttributesError,
    );
  });

  it("forbidden attributes cannot be used for update!", async () => {
    const person = await Person.first();
    await expect(person!.updateBang(new ProtectedParams({ first_name: "Guille" }))).rejects.toThrow(
      ForbiddenAttributesError,
    );
  });

  it("permitted attributes can be used for update", async () => {
    const person = await Person.first();
    await person!.update(new ProtectedParams({ first_name: "Guille" }).permit());

    expect(person!.readAttribute("first_name")).toBe("Guille");
    await person!.reload();
    expect(person!.readAttribute("first_name")).toBe("Guille");
  });

  it("empty forbidden params still save without raising", async () => {
    // Rails' `assign_attributes` returns before sanitizing on an empty bag, so
    // an empty (always un-permitted) params object is an assignment no-op —
    // but `save` still runs inside the transaction.
    const person = await Person.first();
    await expect(person!.update(new ProtectedParams({}))).resolves.toBe(true);
  });
});
