import { describe, expect, it } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";

/** Index a file's extracted tests by description → assertionCount. */
function tsAssertionCounts(source: string, relPath = "packages/activerecord/src/x.test.ts") {
  const info = extractTestsFromSource(source, relPath);
  const out: Record<string, number | undefined> = {};
  for (const tc of info.testCases) out[tc.description] = tc.assertionCount;
  return out;
}

describe("TS extractor assertion-count collection", () => {
  it("counts each expect(...) chain once, not per matcher call", () => {
    const src = `
      describe("s", () => {
        it("two expects", () => {
          expect(a).toEqual(1);
          expect(b).not.toBeNull();
        });
      });
    `;
    expect(tsAssertionCounts(src)["two expects"]).toBe(2);
  });

  it("does not dedup repeated assertion kinds (raw count)", () => {
    const src = `
      it("three equals", () => {
        expect(a).toEqual(1);
        expect(b).toEqual(2);
        expect(c).toEqual(3);
      });
    `;
    expect(tsAssertionCounts(src)["three equals"]).toBe(3);
  });

  it("counts expects inside loops as written (static, not runtime)", () => {
    const src = `
      it("loop", () => {
        for (const x of xs) {
          expect(x).toBeTruthy();
        }
      });
    `;
    expect(tsAssertionCounts(src)["loop"]).toBe(1);
  });

  it("counts whitelisted assert helpers but not Rails query wrappers absent from the Ruby list", () => {
    const src = `
      it("helpers", () => {
        assertQueriesCount(2, () => {
          expect(rows).toHaveLength(2);
        });
        assertDifference(() => Post.count, 1, () => {});
      });
    `;
    // assertQueriesCount is NOT in the Ruby ASSERTION_METHODS whitelist, so it
    // is not counted; the inner expect + assertDifference = 2.
    expect(tsAssertionCounts(src)["helpers"]).toBe(2);
  });

  it("counts refute* helpers that are on the whitelist", () => {
    const src = `
      it("mixed", () => {
        expectQuotedColumnInSql(sql);
        refuteEqual(a, b);
      });
    `;
    // expectQuotedColumnInSql is not on the whitelist (it is not a bare
    // expect(...) primitive); refuteEqual is. = 1
    expect(tsAssertionCounts(src)["mixed"]).toBe(1);
  });

  it("recognizes minitest spec-form twins (must*/wont*/refute*) for symmetry with Ruby", () => {
    const src = `
      it("spec forms", () => {
        mustEqual(a, 1);
        wontEqual(b, 2);
        refuteNil(c);
      });
    `;
    // These mirror Ruby's must_equal/wont_equal/refute_nil so the two sides
    // count the same assertion-kind set (trails normally ports them to expect()).
    expect(tsAssertionCounts(src)["spec forms"]).toBe(3);
  });

  it("reports zero for an assertion-free body", () => {
    const src = `
      it("no asserts", () => {
        const x = compute();
      });
    `;
    expect(tsAssertionCounts(src)["no asserts"]).toBe(0);
  });

  it("does not count non-assertion identifiers that merely start similarly", () => {
    const src = `
      it("decoys", () => {
        assemble();
        expectation();
        expect(v).toBe(1);
      });
    `;
    // assemble (no match), expectation (matches /^expect[A-Z]/? no — lowercase),
    // expect(...) = 1
    expect(tsAssertionCounts(src)["decoys"]).toBe(1);
  });
});
