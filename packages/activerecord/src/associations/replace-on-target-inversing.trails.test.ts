/**
 * Covers `replace_on_target`'s `inversing:` kwarg
 * (activerecord/lib/active_record/associations/collection_association.rb:457,
 * read at :476 — `@replaced_or_added_targets << record if inversing || index ||
 * record.new_record?`), reached from `target=` at :294 with
 * `replace_on_target(record, true, replace: true, inversing: true)`.
 *
 * A *persisted* record folded in through the inversing path is tracked in
 * `@replaced_or_added_targets` only because of the `inversing ||` arm — without
 * it a later add of the same record misses the `:458` index lookup and appends
 * a duplicate instead of replacing in place. This locks that arm: drop
 * `inversing: true` from `CollectionProxy#_wireInverseTarget`'s
 * `_replaceOnTarget` call, or the `inversing ||` factor from the set-add guard,
 * and the second add appends a duplicate.
 */
import { describe, it, expect } from "vitest";
import { Base, association } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { loadSingularTarget } from "../test-helpers/load-singular-target.js";
import { Human } from "../test-helpers/models/human.js";

async function withHasManyInversing(model: typeof Base, fn: () => Promise<void>): Promise<void> {
  const flags = model as unknown as { hasManyInversing: boolean };
  const prev = flags.hasManyInversing;
  flags.hasManyInversing = true;
  try {
    await fn();
  } finally {
    flags.hasManyInversing = prev;
  }
}

describe("replace_on_target inversing (trails)", () => {
  const { interests } = fixtures(["humans", "interests"]);

  it("tracks a persisted record added through the inversing path so a later add replaces in place", async () => {
    await withHasManyInversing(Human, async () => {
      const interest = interests("trainspotting") as Base & { id: number };
      const human = (await loadSingularTarget(interest, "human")) as Base & {
        _associationCache(name: string): { target: Base[] } | undefined;
      };
      const interestIds = (): unknown[] => {
        const cached = human._associationCache("interests") as { target: Base[] } | undefined;
        return (cached?.target ?? []).map((i: Base) => (i as Base & { id: number }).id);
      };

      expect(interestIds()).toEqual([interest.id]);

      await association(human, "interests").push(interest);

      expect(interestIds()).toEqual([interest.id]);
    });
  });
});
