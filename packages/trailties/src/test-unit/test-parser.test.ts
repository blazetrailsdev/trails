import { describe, expect, it } from "vitest";
import { TestParser } from "./test-parser.js";

const FILE = new URL("../__fixtures__/test-unit/test-parser-fixture.ts", import.meta.url).pathname;

describe("TestParserTest", () => {
  it("parser", async () => {
    const definition = async (startLine: number) => {
      const found = await TestParser.definitionFor({
        sourceLocation: () => [FILE, startLine],
      });
      return found && [found[0], found[1].begin, found[1].end];
    };

    expect(await definition(9)).toEqual([FILE, 9, 13]);
    expect(await definition(16)).toEqual([FILE, 16, 16]);
    expect(await definition(19)).toEqual([FILE, 19, 23]);
    expect(await definition(25)).toEqual([FILE, 25, 29]);
    expect(await definition(31)).toEqual([FILE, 31, 31]);
    expect(await definition(33)).toEqual([FILE, 33, 36]);
    expect(await definition(38)).toEqual([FILE, 38, 38]);
    expect(await definition(1)).toBeUndefined();
  });
});
