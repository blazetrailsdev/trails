import { describe, it, expect } from "vitest";
import {
  DEFAULT_REASON,
  NARROW_DEFAULT_REASON,
  suppressedCallsIn,
} from "./missing-rails-call-tags.js";
import { ANY_CLASS, expectationKey, reconcileFileText } from "./build.js";

const block = (...lines: string[]): string =>
  ["/**", ...lines.map((l) => ` * ${l}`), " */"].join("\n");

describe("suppressedCallsIn", () => {
  it("returns the tagged calls, sorted and deduplicated", () => {
    const comment = block(
      "Prose.",
      "@missingRailsCall synchronize — Ruby guards with Mutex#synchronize; trails is single-threaded.",
      "@missingRailsCall reload — satisfied by the caller.",
    );
    expect(suppressedCallsIn(comment)).toEqual(["reload", "synchronize"]);
  });

  it("returns nothing for a comment with no tag", () => {
    expect(suppressedCallsIn(block("Just prose."))).toEqual([]);
  });

  it("throws on a bare tag (the empty-reason contract)", () => {
    expect(() => suppressedCallsIn(block("@missingRailsCall synchronize"))).toThrow(
      /needs a reason/,
    );
  });

  it("throws on a whitespace-only reason", () => {
    expect(() => suppressedCallsIn(block("@missingRailsCall synchronize —   "))).toThrow(
      /needs a reason/,
    );
  });

  it("throws on a call-less tag", () => {
    expect(() => suppressedCallsIn(block("@missingRailsCall"))).toThrow(/needs a call/);
  });

  it("throws on a call-less tag that goes straight to the em-dash", () => {
    expect(() => suppressedCallsIn(block("@missingRailsCall — the caller does it."))).toThrow(
      /needs a call/,
    );
  });

  it("throws on a call-less one-line tag", () => {
    expect(() => suppressedCallsIn("/** @missingRailsCall */")).toThrow(/needs a call/);
  });

  it("names the file:line of a call-less tag", () => {
    const comment = block("Prose.", "@missingRailsCall");
    expect(() => suppressedCallsIn(comment, { fileName: "a/b.ts", startLine: 10 })).toThrow(
      /a\/b\.ts:12/,
    );
  });

  it("names the file:line of a call-less one-line tag", () => {
    const comment = "// lead\n/** @missingRailsCall */";
    expect(() => suppressedCallsIn(comment, { fileName: "a/b.ts", startLine: 10 })).toThrow(
      /a\/b\.ts:11/,
    );
  });

  it("does not treat a prose mention of the tag word as call-less", () => {
    expect(suppressedCallsIn(block("@missingRailsCallSite is a different thing."))).toEqual([]);
  });

  it("names the file:line of the offending tag", () => {
    const comment = block("Prose.", "@missingRailsCall synchronize");
    expect(() => suppressedCallsIn(comment, { fileName: "a/b.ts", startLine: 10 })).toThrow(
      /a\/b\.ts:12/,
    );
  });

  it("keeps a deeper-indented Ruby ivar in the reason prose out of the call set", () => {
    // project_bare_jsdoc_tag_in_reason_prose_drops_surface: a line-leading `@`
    // inside a reason has bitten this tag family before. The hang indent the
    // generator writes keeps it a continuation, not a second tag.
    const comment = [
      "/**",
      " * @missingRailsCall reset — the reader memoizes through",
      " *   @primary_key instead, so Rails' reset has no counterpart.",
      " */",
    ].join("\n");
    expect(suppressedCallsIn(comment)).toEqual(["reset"]);
  });

  it("never mints a suppression from a line-leading prose tag in a reason", () => {
    const comment = block(
      "@missingRailsCall reset — see below.",
      "@primary_key is what the reader memoizes through.",
    );
    expect(suppressedCallsIn(comment)).toEqual(["reset"]);
  });

  it("parses a one-line comment carrying a tag", () => {
    expect(
      suppressedCallsIn("/** @missingRailsCall first — the caller already ordered. */"),
    ).toEqual(["first"]);
  });

  it("keeps the prose of a one-line comment out of the call set", () => {
    const comment = "  /** Prose. @missingRailsCall first — the caller already ordered. */";
    expect(suppressedCallsIn(comment)).toEqual(["first"]);
  });

  it("throws on a bare one-line tag (the empty-reason contract)", () => {
    expect(() => suppressedCallsIn("/** @missingRailsCall first */")).toThrow(/needs a reason/);
  });

  it("names the source line of an offending one-line tag", () => {
    const comment = "// lead\n/** @missingRailsCall first */";
    expect(() => suppressedCallsIn(comment, { fileName: "a/b.ts", startLine: 10 })).toThrow(
      /a\/b\.ts:11/,
    );
  });

  it("does not treat the seeded placeholder as a justification", () => {
    expect(suppressedCallsIn(block(`@missingRailsCall synchronize — ${DEFAULT_REASON}`))).toEqual(
      [],
    );
  });

  it("does not treat the narrow baseline's seeded placeholder as a justification", () => {
    expect(
      suppressedCallsIn(block(`@missingRailsCall synchronize — ${NARROW_DEFAULT_REASON}`)),
    ).toEqual([]);
  });

  it("treats the placeholder as unjustified even when parity:api:build wrapped it", () => {
    const wrapped = [
      "/**",
      " * @missingRailsCall first — Baseline (RFC 0047): wide call-set flag seeded",
      " *   when the wide ratchet landed; bucket (b) equivalent or (c) noise pending",
      " *   per-cluster burndown review.",
      " */",
    ].join("\n");
    expect(suppressedCallsIn(wrapped)).toEqual([]);
  });
});

describe("parity:api:build over a hand-written one-line tag", () => {
  const expectations = new Map([
    [
      expectationKey(ANY_CLASS, "bar"),
      { rubyNames: ["bar"], tsName: "bar", calls: new Set(["first"]) },
    ],
  ]);
  const reason = "the caller already ordered.";
  const src = [
    "export class Foo {",
    "  /** @missingRailsCall first — the caller already ordered. */",
    "  bar(): void {}",
    "}",
  ].join("\n");

  it("normalizes it to block form, preserving the curated reason", () => {
    const { text } = reconcileFileText("foo.ts", src, expectations, () => reason);
    expect(text).not.toBeNull();
    expect(text!).toContain(
      ["  /**", "   * @missingRailsCall first — the caller already ordered.", "   */"].join("\n"),
    );
  });

  it("makes no further edit on a second run", () => {
    const first = reconcileFileText("foo.ts", src, expectations, () => reason).text!;
    expect(reconcileFileText("foo.ts", first, expectations, () => reason).text).toBeNull();
  });
});
