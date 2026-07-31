import { describe, it, expect } from "vitest";
import { suppressedCallsIn } from "./missing-rails-call-tags.js";

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
});
