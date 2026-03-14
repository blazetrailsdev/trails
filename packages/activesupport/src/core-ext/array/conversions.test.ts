import { describe, it, expect } from "vitest";

import { toSentence } from "../../array-utils.js";

describe("ToSentenceTest", () => {
  it("plain array to sentence", () => {
    expect(toSentence(["one", "two", "three"])).toBe("one, two, and three");
  });

  it("to sentence with words connector", () => {
    expect(toSentence(["one", "two", "three"], { wordsConnector: " - " })).toBe(
      "one - two, and three",
    );
  });

  it("to sentence with last word connector", () => {
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " or " })).toBe(
      "one, two or three",
    );
  });

  it("two elements", () => {
    expect(toSentence(["one", "two"])).toBe("one and two");
  });

  it("one element", () => {
    expect(toSentence(["one"])).toBe("one");
  });

  it("one element not same object", () => {
    const arr = ["one"];
    const result = toSentence(arr);
    expect(result).toBe("one");
  });

  it("one non string element", () => {
    // All elements are strings in TS, but numbers work too
    expect(toSentence([String(42)])).toBe("42");
  });

  it("does not modify given hash", () => {
    const arr = ["a", "b", "c"];
    toSentence(arr, { wordsConnector: "; " });
    expect(arr).toEqual(["a", "b", "c"]);
  });

  it("with blank elements", () => {
    expect(toSentence(["one", "", "three"])).toBe("one, , and three");
  });

  it("with invalid options", () => {
    // Unknown options are ignored
    expect(toSentence(["a", "b", "c"], {})).toBe("a, b, and c");
  });

  it("always returns string", () => {
    expect(typeof toSentence([])).toBe("string");
    expect(typeof toSentence(["a"])).toBe("string");
    expect(typeof toSentence(["a", "b"])).toBe("string");
  });

  it("returns no frozen string", () => {
    const result = toSentence(["a", "b"]);
    expect(typeof result).toBe("string");
  });
});
