import { describe, expect, it } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";

function flags(source: string) {
  const info = extractTestsFromSource(source, "packages/mail/test/x.test.ts");
  return Object.fromEntries(
    info.testCases.map((tc) => [tc.description, { pending: tc.pending, permanent: tc.permanent }]),
  );
}

describe("permanent skips", () => {
  it("marks a skip under a PERMANENT-SKIP: line, and every one-line skip in its run", () => {
    expect(
      flags(`
describe("D", () => {
  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose"
  it.skip("a", () => {});
  it.skip("b", () => {});

  // PERMANENT-SKIP: upstream
  it.todo("c");
});
`),
    ).toEqual({
      a: { pending: true, permanent: true },
      b: { pending: true, permanent: true },
      c: { pending: true, permanent: true },
    });
  });

  it("leaves a BLOCKED: skip and an uncommented skip as open gaps", () => {
    expect(
      flags(`
describe("D", () => {
  // BLOCKED: some-story
  it.skip("a", () => {});
  it("runs", () => {
    expect(1).toBe(1);
  });
  it.skip("b", () => {});
});
`),
    ).toEqual({
      a: { pending: true, permanent: undefined },
      runs: { pending: false, permanent: undefined },
      b: { pending: true, permanent: undefined },
    });
  });
});
