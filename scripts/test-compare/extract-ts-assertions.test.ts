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

  it("counts trails expect* assertion helpers (twins of Rails assert_* helpers)", () => {
    const src = `
      it("mixed", () => {
        expectQuotedColumnInSql(sql);
        refuteEqual(a, b);
      });
    `;
    // expectQuotedColumnInSql stands in for a Rails assert_* twin, so it counts;
    // refuteEqual counts too. = 2
    expect(tsAssertionCounts(src)["mixed"]).toBe(2);
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

  it("expands same-file helper functions into the delegating test's count", () => {
    const src = `
      async function testCopyTable(conn, from, to) {
        expect(await rowCount(conn, to)).toEqual(1);
        expect(await columnNames(conn, to)).toEqual(cols);
      }
      describe("s", () => {
        it("copy table with binary column", async () => {
          await testCopyTable(conn, "binaries", "binaries2");
        });
      });
    `;
    // Body delegates entirely to the helper (0 direct); expansion folds in the
    // helper's 2 expects. This is the copy_table symmetry trap: the Ruby side
    // must expand test_copy_table to the same 2, or a false mismatch appears.
    expect(tsAssertionCounts(src)["copy table with binary column"]).toBe(2);
  });

  it("counts a block passed to a helper lexically, plus the helper body once", () => {
    const src = `
      const testCopyTable = async (conn, from, to, block) => {
        expect(a).toEqual(1);
        await block?.();
      };
      it("with block", async () => {
        await testCopyTable(conn, "x", "y", async () => {
          expect(b).toBeNull();
        });
      });
    `;
    // helper body expect (1) + lexical block expect (1) = 2
    expect(tsAssertionCounts(src)["with block"]).toBe(2);
  });

  it("expands helpers recursively through sub-helpers (depth-capped)", () => {
    const src = `
      function doDumpIndexAssertionsForOneIndex() {
        expect(a).toEqual(1);
        expect(b).toEqual(2);
      }
      function doDumpIndexTestsForSchema() {
        expect(top).toBeTruthy();
        doDumpIndexAssertionsForOneIndex();
        doDumpIndexAssertionsForOneIndex();
      }
      it("dump indexes for schema one", () => {
        doDumpIndexTestsForSchema();
      });
    `;
    // top expect (1) + 2 sub-helper calls × 2 expects = 5
    expect(tsAssertionCounts(src)["dump indexes for schema one"]).toBe(5);
  });

  it("guards against helper recursion cycles", () => {
    const src = `
      function ping() { expect(a).toEqual(1); pong(); }
      function pong() { expect(b).toEqual(2); ping(); }
      it("cyclic", () => { ping(); });
    `;
    // ping(1) → pong(1) → ping is on the path (skipped) = 2, no infinite loop
    expect(tsAssertionCounts(src)["cyclic"]).toBe(2);
  });

  it("ignores assertion look-alikes and non-assertion identifiers", () => {
    const src = `
      it("lookalikes", () => {
        const assertion = build();   // 'assert'+ 'ion' — no boundary
        assertion.run();
        asserted();                  // 'assert' + 'ed' — no boundary
        expectation();               // 'expect' + 'ation' — no boundary
        expect(v).toBe(1);           // the only real assertion
      });
    `;
    expect(tsAssertionCounts(src)["lookalikes"]).toBe(1);
  });
});

/** Index a file's extracted tests by description → assertionKinds. */
function tsAssertionKinds(source: string, relPath = "packages/activerecord/src/x.test.ts") {
  const info = extractTestsFromSource(source, relPath);
  const out: Record<string, string[] | undefined> = {};
  for (const tc of info.testCases) out[tc.description] = tc.assertionKinds;
  return out;
}

describe("TS extractor assertion-kind collection", () => {
  it("records the terminal matcher of each expect(...) chain", () => {
    const src = `
      it("matchers", () => {
        expect(a).toEqual(1);
        expect(b).toBeNull();
      });
    `;
    expect(tsAssertionKinds(src)["matchers"]).toEqual(["toEqual", "toBeNull"]);
  });

  it("folds a .not chain into a not: token", () => {
    const src = `
      it("negated", () => {
        expect(a).not.toBeNull();
        expect(b).not.toEqual(2);
      });
    `;
    expect(tsAssertionKinds(src)["negated"]).toEqual(["not:toBeNull", "not:toEqual"]);
  });

  it("does not dedup repeated matchers (raw histogram input)", () => {
    const src = `
      it("repeats", () => {
        expect(a).toEqual(1);
        expect(b).toEqual(2);
      });
    `;
    expect(tsAssertionKinds(src)["repeats"]).toEqual(["toEqual", "toEqual"]);
  });

  it("records a helper callee by its own name", () => {
    const src = `
      it("helpers", () => {
        assertQueriesCount(2, () => {
          expect(rows).toHaveLength(2);
        });
        refuteEqual(a, b);
      });
    `;
    expect(tsAssertionKinds(src)["helpers"]).toEqual([
      "assertQueriesCount",
      "toHaveLength",
      "refuteEqual",
    ]);
  });

  it("expands same-file helper bodies into the delegating test's kinds", () => {
    const src = `
      function testCopyTable(conn, to) {
        expect(rowCount(conn, to)).toEqual(1);
        expect(columnNames(conn, to)).toBeNull();
      }
      it("copy table", () => {
        testCopyTable(conn, "binaries2");
      });
    `;
    // Symmetric with assertionCount's helper expansion: the delegating test's
    // kinds fold in the helper body's matchers so the histogram is comparable.
    expect(tsAssertionKinds(src)["copy table"]).toEqual(["toEqual", "toBeNull"]);
  });
});

/** Index a file's extracted tests by description → assertionValues. */
function tsAssertionValues(source: string, relPath = "packages/activerecord/src/x.test.ts") {
  const info = extractTestsFromSource(source, relPath);
  const out: Record<string, (string | null)[] | undefined> = {};
  for (const tc of info.testCases) out[tc.description] = tc.assertionValues;
  return out;
}

describe("TS extractor assertion-value collection", () => {
  it("captures literal matcher arguments as tagged tokens, lockstep with kinds", () => {
    const src = `
      it("literals", () => {
        expect(a).toEqual(5);
        expect(b).toEqual("hi");
        expect(c).toEqual(true);
        expect(d).toBeNull();
      });
    `;
    // toBeNull() has no argument → null slot; length matches assertionKinds.
    expect(tsAssertionValues(src)["literals"]).toEqual(["n:5", "s:hi", "b:true", null]);
  });

  it("captures negative numeric literals", () => {
    const src = `
      it("neg", () => {
        expect(a).toEqual(-3);
      });
    `;
    expect(tsAssertionValues(src)["neg"]).toEqual(["n:-3"]);
  });

  it("folds null and undefined matcher args to the x:nil token", () => {
    const src = `
      it("nils", () => {
        expect(a).toEqual(null);
        expect(b).toEqual(undefined);
      });
    `;
    expect(tsAssertionValues(src)["nils"]).toEqual(["x:nil", "x:nil"]);
  });

  it("emits null for a non-literal (variable/expression) matcher argument", () => {
    const src = `
      it("computed", () => {
        expect(a).toEqual(expected);
        expect(b).toEqual(1 + 2);
        expect(c).toEqual(7);
      });
    `;
    expect(tsAssertionValues(src)["computed"]).toEqual([null, null, "n:7"]);
  });

  it("captures values through helper expansion in lockstep with kinds", () => {
    const src = `
      function checkRow() {
        expect(a).toEqual(1);
        expect(b).toEqual(2);
      }
      it("delegates", () => {
        checkRow();
      });
    `;
    expect(tsAssertionValues(src)["delegates"]).toEqual(["n:1", "n:2"]);
  });

  it("emits null value for a non-value-bearing helper callee kind", () => {
    const src = `
      it("callee", () => {
        assertQueriesCount(2, () => {});
      });
    `;
    // assertQueriesCount normalizes to no canonical value-bearing kind → null.
    expect(tsAssertionValues(src)["callee"]).toEqual([null]);
  });

  it("captures the mapped expected arg for value-bearing helper callees", () => {
    const src = `
      it("helpers", () => {
        assertSame(5, actual);
        refuteEqual("hi", b);
        assertIncludes(coll, "member");
        assertSame(other, actual);
      });
    `;
    // assertSame/refuteEqual take arg 0; the *Includes membership family takes
    // arg 1 (the member); a non-literal arg 0 → null. Lockstep with 4 kinds.
    expect(tsAssertionValues(src)["helpers"]).toEqual(["n:5", "s:hi", "s:member", null]);
  });
});
