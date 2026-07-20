import { describe, it, expect } from "vitest";
import { Visitors } from "@blazetrails/arel";
import { Array as OidArray, Data as ArrayData } from "./array.js";
import { StringType } from "@blazetrails/activemodel";

// trails-only: the connection-less Arel quoter (`postgresqlDefaultQuoter`)
// re-implements the array literal that the adapter builds via
// `quote(ArrayData)` -> `encode_array`. Three PRs (#4867, #4869, #4872) each had
// to re-converge the copy after it drifted. Both now share
// `encodeArrayElement`; this pins that they agree byte-for-byte.
describe("PostgreSQL array literal encoding", () => {
  const encoder = new OidArray(new StringType());
  const arelQuoter = Visitors.postgresqlDefaultQuoter;

  const cases: [string, unknown[]][] = [
    ["strings", ["a", "b"]],
    ["booleans", [true, false]],
    ["nested arrays", [["a"], ["b", "c"]]],
    ["NULL", [null]],
    ["the NULL string", ["NULL", "null"]],
    ["empty strings", [""]],
    ["delimiter-bearing content", ["a,b"]],
    ["whitespace content", ["a b", "a\tb"]],
    ["quotes and backslashes", ['he said "hi"', "a\\b"]],
    ["braces", ["{a}"]],
    // The live drift this story removed: `encode` tested `/\s/`, which matches
    // non-ASCII spaces, where pg's `isspace()` (and the Arel copy) is ASCII-only,
    // so the adapter over-quoted a NBSP b.
    ["non-ASCII whitespace", ["a\u00a0b"]],
  ];

  for (const [name, values] of cases) {
    it(`agrees between the Arel quoter and encode_array for ${name}`, () => {
      const viaAdapter = new ArrayData(encoder, values).toString();
      // The Arel path wraps the literal in single quotes; strip them to compare
      // the encoding itself.
      const viaArel = arelQuoter.quote(values).slice(1, -1);
      expect(viaArel).toBe(viaAdapter);
    });
  }
});
