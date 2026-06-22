/**
 * Unit tests for the strip-asany codemod's pure transform layer (candidate
 * detection + textual removal). The recompile/revert loop is exercised
 * end-to-end when the tool is run for real in burndown PRs; here we pin down
 * the scope rules against a fixture file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findCandidateCasts, removeCast } from "./strip-asany.js";

const FIXTURE = resolve(import.meta.dirname, "__fixtures__", "strip-asany-fixture.ts");
const fixtureText = readFileSync(FIXTURE, "utf8");

describe("findCandidateCasts", () => {
  it("matches only `(expr as any).member` with a non-underscore member", () => {
    const members = findCandidateCasts(fixtureText).map((c) => c.member);
    expect(members).toEqual(["id", "name", "toFixed"]);
  });

  it("skips underscore (private) member reaches", () => {
    expect(findCandidateCasts("(x as any)._privateField;")).toEqual([]);
  });

  it("skips array casts (`as any[]`)", () => {
    expect(findCandidateCasts("(x as any[]).length;")).toEqual([]);
  });

  it("skips terminal casts with no member access", () => {
    expect(findCandidateCasts("const y = x as any;")).toEqual([]);
  });
});

describe("removeCast", () => {
  it("drops the redundant parens when the inner expression is left-hand-side", () => {
    const text = "(thing as any).id";
    const [span] = findCandidateCasts(text);
    expect(removeCast(text, span)).toBe("thing.id");
  });

  it("keeps load-bearing parens for a non-left-hand-side inner expression", () => {
    const text = "(a + b as any).toFixed";
    const [span] = findCandidateCasts(text);
    expect(removeCast(text, span)).toBe("(a + b).toFixed");
  });

  it("removes only the targeted casts when applied end-to-start", () => {
    const spans = findCandidateCasts(fixtureText).sort((a, b) => b.start - a.start);
    let out = fixtureText;
    for (const span of spans) {
      out = removeCast(out, span);
    }
    expect(out).toContain("sink(thing.id);");
    expect(out).toContain("sink(getThing().name);");
    expect(out).toContain("sink((a + b).toFixed);");
    // Untouched scopes survive verbatim.
    expect(out).toContain("sink((thing as any)._privateField);");
    expect(out).toContain("sink((thing as any[]).length);");
    expect(out).toContain("sink(thing as any);");
  });
});
