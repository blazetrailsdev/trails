import { describe, it, expect, vi } from "vitest";
import { StandardError, stderr } from "@blazetrails/ruby-compat";
import { SPELL_CHECKERS, correctError, spellCheckers } from "./did-you-mean.js";
import { NullChecker } from "./spell-checkers/null-checker.js";

describe("DidYouMean.correct_error", () => {
  it("records the checker by class name and leaves NullChecker as the default", () => {
    class TypoError extends StandardError {}
    class TypoChecker {}

    correctError(TypoError, TypoChecker);

    expect(spellCheckers().get("TypoError")).toBe(TypoChecker);
    expect(spellCheckers().default()).toBe(NullChecker);
    expect(new NullChecker().corrections).toEqual([]);
  });
});

describe("DidYouMean::SPELL_CHECKERS", () => {
  it("warns and forwards merge! to correct_error", () => {
    class MergedError extends StandardError {}
    class MergedChecker {}
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    try {
      SPELL_CHECKERS.mergeBang(new Map([[MergedError, MergedChecker]]));
      expect(write.mock.lastCall![0]).toContain("SPELL_CHECKERS.merge!");
    } finally {
      write.mockRestore();
    }
    expect(spellCheckers().get("MergedError")).toBe(MergedChecker);
  });
});
