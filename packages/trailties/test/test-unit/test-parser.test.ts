import { beforeAll, describe, expect, it, test } from "vitest";
import { TestParser } from "../../lib/test-unit/test-parser.js";

describe("TestParserTestFixture", () => {
  it("method", () => {
    expect(true).toBe(true);

    expect(true).toBe(true);
  });

  // prettier-ignore
  it("oneline", () => { expect(true).toBe(true); });

  test("declarative", () => {
    expect(true).toBe(true);

    expect(true).toBe(true);
  });

  test("declarative w/parens", () => {
    expect(true).toBe(true);
  });

  test("declarative explicit receiver", () => {
    expect(true).toBe(true);

    expect(true).toBe(true);
  });

  test("declarative oneline", () => expect(true).toBe(true));

  // prettier-ignore
  test("declarative oneline do", function () { expect(true).toBe(true); });

  test("declarative multiline w/ braces", () => {
    expect(true).toBe(true);
    expect(false).toBe(false);
  });
});

const FILE = new URL(import.meta.url).pathname;

describe("TestParserTest", () => {
  beforeAll(() => TestParser.requireParser());

  it("parser", () => {
    const actual = [5, 12, 14, 20, 24, 30, 33, 35].map((startLine) => {
      const [path, range] = TestParser.definitionFor({
        sourceLocation: () => [FILE, startLine],
      })!;
      return [path, range.begin, range.end];
    });

    expect(actual).toEqual([
      [FILE, 5, 9],
      [FILE, 12, 12],
      [FILE, 14, 18],
      [FILE, 20, 22],
      [FILE, 24, 28],
      [FILE, 30, 30],
      [FILE, 33, 33],
      [FILE, 35, 38],
    ]);
  });
});
