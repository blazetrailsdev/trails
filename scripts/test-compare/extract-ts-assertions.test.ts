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

  it("counts Rails custom assert helpers (query wrappers) via the assert* prefix", () => {
    const src = `
      it("helpers", () => {
        assertQueriesCount(2, () => {
          expect(rows).toHaveLength(2);
        });
        assertDifference(() => Post.count, 1, () => {});
      });
    `;
    // assertQueriesCount + inner expect + assertDifference = 3. The prefix rule
    // counts custom Rails helpers symmetrically with the Ruby side.
    expect(tsAssertionCounts(src)["helpers"]).toBe(3);
  });

  it("counts refute* but not expect-prefixed helper names", () => {
    const src = `
      it("mixed", () => {
        expectQuotedColumnInSql(sql);
        refuteEqual(a, b);
      });
    `;
    // expectQuotedColumnInSql is not the bare `expect(...)` primitive and does
    // not match the assert/refute/must/wont prefix; refuteEqual does. = 1
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
    // Mirror Ruby's must_equal/wont_equal/refute_nil (trails normally ports
    // these to expect()), so the two sides count the same assertion-kind set.
    expect(tsAssertionCounts(src)["spec forms"]).toBe(3);
  });

  it("ignores assertion look-alikes and non-assertion identifiers", () => {
    const src = `
      it("lookalikes", () => {
        const assertion = build();   // 'assert'+ 'ion' — no boundary
        assertion.run();
        asserted();                  // 'assert' + 'ed' — no boundary
        expectation();               // not the bare expect primitive
        expect(v).toBe(1);           // the only real assertion
      });
    `;
    expect(tsAssertionCounts(src)["lookalikes"]).toBe(1);
  });
});
