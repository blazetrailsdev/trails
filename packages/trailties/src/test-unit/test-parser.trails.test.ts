import { describe, expect, it } from "vitest";
import { TestParser } from "./test-parser.js";

const FILE = new URL("../__fixtures__/test-unit/test-parser-fixture.ts", import.meta.url).pathname;

describe("TestParser.definitionFor", () => {
  it("answers null for a line no definition starts on", () => {
    expect(TestParser.definitionFor({ sourceLocation: () => [FILE, 6] })).toBeNull();
  });
});
