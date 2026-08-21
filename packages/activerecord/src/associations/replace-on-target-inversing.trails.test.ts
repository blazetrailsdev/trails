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
 * `inversing: true` from `CollectionAssociation#target=`'s `replaceOnTarget`
 * call, or the `inversing ||` factor from the set-add guard, and the second add
 * appends a duplicate.
 */
import { describe, it, expect } from "vitest";
import { Base, association } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { loadSingularTarget } from "../test-helpers/load-singular-target.js";
import { Interest } from "../test-helpers/models/interest.js";

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
    await withHasManyInversing(Interest, async () => {
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

/**
 * Covers `CollectionAssociation#target=`
 * (activerecord/lib/active_record/associations/collection_association.rb:285-296),
 * whose `has_many_inversing` arm folds a lone record in through
 * `replace_on_target(record, true, replace: true, inversing: true)` rather than
 * replacing the target with it. The writer is what Rails' inverse wiring
 * reaches (`association.rb:154` — `inversed_from` is a bare `self.target =
 * record`), so a holder-only setter silently drops every record already in the
 * collection.
 */
describe("CollectionAssociation#target= (trails)", () => {
  const { humans, interests } = fixtures(["humans", "interests"]);

  it("folds a lone record into the loaded target under has_many_inversing", async () => {
    await withHasManyInversing(Interest, async () => {
      const human = humans("gordon") as Base;
      await association(human, "interests");
      const assoc = (
        human as unknown as { association(name: string): { target: Base[] } }
      ).association("interests");

      const loadedIds = assoc.target.map((i) => (i as Base & { id: number }).id);
      expect(loadedIds.length).toBeGreaterThan(1);

      const hunting = interests("hunting") as Base & { id: number };
      (assoc as unknown as { target: Base }).target = hunting;

      expect(assoc.target.map((i) => (i as Base & { id: number }).id)).toEqual([
        ...loadedIds,
        hunting.id,
      ]);
    });
  });
});
