import { describe, expect, it } from "vitest";
import { TestParser } from "./test-parser.js";

const FILE = new URL("../__fixtures__/test-unit/test-parser-fixture.ts", import.meta.url).pathname;

describe("TestParserTest", () => {
  it("parser", () => {
    const actual = [8, 15, 18, 24, 28, 34, 37, 39, 44].map((startLine) => {
      const [path, range] = TestParser.definitionFor({
        sourceLocation: () => [FILE, startLine],
      })!;
      return [path, range.begin, range.end];
    });

    expect(actual).toEqual([
      [FILE, 8, 12],
      [FILE, 15, 15],
      [FILE, 18, 22],
      [FILE, 24, 26],
      [FILE, 28, 32],
      [FILE, 34, 34],
      [FILE, 37, 37],
      [FILE, 39, 42],
      [FILE, 44, 44],
    ]);
  });
});
