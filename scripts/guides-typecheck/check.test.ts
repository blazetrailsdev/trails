import { describe, expect, it } from "vitest";
import { type Block, extractBlocks, remapDiagnostics } from "./check.js";

describe("extractBlocks", () => {
  it("pulls out ts and typescript blocks with correct start lines", () => {
    const md = [
      "# Heading", // 1
      "", // 2
      "```ts", // 3 <- block starts line 4
      "const x = 1;", // 4
      "```", // 5
      "", // 6
      "```typescript", // 7 <- block starts line 8
      "const y = 2;", // 8
      "```", // 9
    ].join("\n");
    const { blocks, untagged } = extractBlocks("a.md", md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startLine).toBe(4);
    expect(blocks[0].code).toBe("const x = 1;");
    expect(blocks[1].startLine).toBe(8);
    expect(untagged).toHaveLength(0);
  });

  it("skips non-ts languages", () => {
    const md = ["```sh", "ls", "```", "", "```ts", "const x = 1;", "```"].join("\n");
    const { blocks } = extractBlocks("a.md", md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("const x = 1;");
  });

  it("flags untagged fenced blocks", () => {
    const md = ["```", "const x = 1;", "```"].join("\n");
    const { blocks, untagged } = extractBlocks("a.md", md);
    expect(blocks).toHaveLength(0);
    expect(untagged).toHaveLength(1);
    expect(untagged[0].line).toBe(1);
  });

  it("honors <!-- typecheck:skip --> on the preceding non-blank line", () => {
    const md = ["<!-- typecheck:skip -->", "", "```ts", "const x: string = 5;", "```"].join("\n");
    const { blocks } = extractBlocks("a.md", md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].skip).toBe(true);
  });

  it("does not apply skip marker when separated by non-blank content", () => {
    const md = [
      "<!-- typecheck:skip -->",
      "",
      "some prose",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    const { blocks } = extractBlocks("a.md", md);
    expect(blocks[0].skip).toBe(false);
  });

  it("extracts indented fenced blocks and strips the fence's indent", () => {
    const md = [
      "- A list item with a nested block:", // 1
      "", // 2
      "  ```ts", // 3 — content starts on line 4
      "  const x = 1;", // 4
      "  ```", // 5
    ].join("\n");
    const { blocks, untagged } = extractBlocks("a.md", md);
    expect(untagged).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("const x = 1;");
    expect(blocks[0].startLine).toBe(4);
  });

  it("accepts a language tag separated from backticks by whitespace", () => {
    const md = ["``` ts", "const x = 1;", "```"].join("\n");
    const { blocks, untagged } = extractBlocks("a.md", md);
    expect(untagged).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe("const x = 1;");
  });

  it("handles 4+ backtick fences (fence containing ``` inside)", () => {
    const md = [
      "````ts", // 1 — content starts on line 2
      "const s = `hello ${'world'}`;", // 2
      "const example = '```';", // 3  <- fake 3-backtick closer; must NOT close
      "````", // 4
    ].join("\n");
    const { blocks, untagged } = extractBlocks("a.md", md);
    expect(untagged).toHaveLength(0);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe(
      ["const s = `hello ${'world'}`;", "const example = '```';"].join("\n"),
    );
  });

  it("throws on an unterminated fenced block", () => {
    const md = ["```ts", "const x = 1;"].join("\n");
    expect(() => extractBlocks("a.md", md)).toThrow(/Unterminated fenced code block in a\.md/);
  });

  it("handles adjacent blocks without bleeding state", () => {
    const md = ["```ts", "const x = 1;", "```", "```ts", "const y = 2;", "```"].join("\n");
    const { blocks } = extractBlocks("a.md", md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toBe("const x = 1;");
    expect(blocks[1].code).toBe("const y = 2;");
  });
});

describe("remapDiagnostics", () => {
  const repoRoot = "/repo";
  const block: Block = {
    file: "/repo/packages/website/docs/guides/foo.md",
    startLine: 42,
    code: "// irrelevant",
    skip: false,
  };
  const blocksByIdx = new Map<number, Block>([[7, block]]);

  it("rewrites tsc paren-form diagnostics (file.ts(L,C))", () => {
    const raw =
      "/tmp/run-X/blocks/packages_website_docs_guides_foo_md__L42__7.ts(3,9): error TS2322: bad type";
    expect(remapDiagnostics(raw, blocksByIdx, repoRoot)).toBe(
      "packages/website/docs/guides/foo.md:44:9: error TS2322: bad type",
    );
  });

  it("rewrites tsc colon-form diagnostics (file.ts:L:C)", () => {
    const raw =
      "/tmp/run-X/blocks/packages_website_docs_guides_foo_md__L42__7.ts:3:9 - error TS2322: bad type";
    expect(remapDiagnostics(raw, blocksByIdx, repoRoot)).toBe(
      "packages/website/docs/guides/foo.md:44:9 - error TS2322: bad type",
    );
  });

  it("handles paths containing spaces", () => {
    const raw =
      "/Users/Jane Doe/repo/.tmp/run-X/blocks/packages_website_docs_guides_foo_md__L42__7.ts(3,9): error TS1234";
    expect(remapDiagnostics(raw, blocksByIdx, repoRoot)).toBe(
      "packages/website/docs/guides/foo.md:44:9: error TS1234",
    );
  });

  it("leaves unrelated lines untouched", () => {
    const raw = "some unrelated line\nanother one";
    expect(remapDiagnostics(raw, blocksByIdx, repoRoot)).toBe(raw);
  });

  it("leaves matches with unknown idx unchanged", () => {
    const raw =
      "/tmp/run-X/blocks/packages_website_docs_guides_foo_md__L42__99.ts(3,9): error TS2322: bad type";
    expect(remapDiagnostics(raw, blocksByIdx, repoRoot)).toBe(raw);
  });
});
