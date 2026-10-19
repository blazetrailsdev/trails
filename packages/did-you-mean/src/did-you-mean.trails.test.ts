import { describe, it, expect } from "vitest";
import { StandardError } from "@blazetrails/ruby-compat";
import { correctError, spellCheckers } from "./did-you-mean.js";
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
