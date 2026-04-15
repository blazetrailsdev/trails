import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { virtualize, remapLine } from "./virtualize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "fixtures");

function fixtureDirs(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe("virtualize — fixture pairs", () => {
  for (const name of fixtureDirs()) {
    const dir = path.join(FIXTURES_DIR, name);
    const inputPath = path.join(dir, "input.ts");
    const expectedPath = path.join(dir, "expected.ts");
    test(name, () => {
      const input = fs.readFileSync(inputPath, "utf8");
      const expected = fs.readFileSync(expectedPath, "utf8");
      const { text } = virtualize(input, inputPath);
      expect(text).toBe(expected);
    });
  }
});

describe("virtualize — deltas", () => {
  test("records one delta per injected block", () => {
    const src =
      "export class Post extends Base {\n" +
      "  static {\n" +
      '    this.attribute("title", "string");\n' +
      '    this.attribute("body", "string");\n' +
      "  }\n" +
      "}\n";
    const { deltas } = virtualize(src, "post.ts");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.lineCount).toBe(3); // leading \n + 2 declare lines
  });

  test("no deltas when no class matches Base", () => {
    const { deltas, text } = virtualize("export class NotAModel {}\n", "nope.ts");
    expect(deltas).toHaveLength(0);
    expect(text).toBe("export class NotAModel {}\n");
  });

  test("skip marker yields no deltas", () => {
    const src =
      "/** @trails-typegen skip */\n" +
      "export class Post extends Base {\n" +
      '  static { this.attribute("t", "string"); }\n' +
      "}\n";
    const { deltas } = virtualize(src, "skip.ts");
    expect(deltas).toHaveLength(0);
  });
});

describe("remapLine", () => {
  test("lines above injection are unchanged", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    expect(remapLine(2, deltas)).toBe(2);
    expect(remapLine(5, deltas)).toBe(5);
  });

  test("lines below injection subtract the inserted line count", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    // A diagnostic at virtualized line 10 should map back to line 7.
    expect(remapLine(10, deltas)).toBe(7);
  });

  test("lines inside the injected range return null", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    expect(remapLine(6, deltas)).toBeNull();
    expect(remapLine(7, deltas)).toBeNull();
    expect(remapLine(8, deltas)).toBeNull();
  });

  test("multiple deltas compose correctly", () => {
    const deltas = [
      { insertedAtLine: 5, lineCount: 2 },
      { insertedAtLine: 15, lineCount: 3 },
    ];
    // Below first injection only.
    expect(remapLine(10, deltas)).toBe(8);
    // Below both injections.
    expect(remapLine(25, deltas)).toBe(20);
    // Above everything.
    expect(remapLine(3, deltas)).toBe(3);
  });

  test("empty delta list is identity", () => {
    expect(remapLine(42, [])).toBe(42);
  });
});

describe("virtualize — idempotence", () => {
  test("re-virtualizing the output skips members already declared", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static { this.attribute("title", "string"); }\n' +
      "}\n";
    const once = virtualize(src, "post.ts").text;
    const twice = virtualize(once, "post.ts").text;
    expect(twice).toBe(once);
  });
});
