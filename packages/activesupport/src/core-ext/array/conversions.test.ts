import { describe, it, expect } from "vitest";

import { toFormattedS, toFs, toSentence } from "../../array-utils.js";
import { ArgumentError } from "../../hash-utils.js";

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
    expect(() => toSentence(["one", "two"], { passing: "invalid option" } as never)).toThrowError(
      new ArgumentError(
        "Unknown key: :passing. Valid keys are: :wordsConnector, :twoWordsConnector, :lastWordConnector, :locale",
      ),
    );
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

describe("ToFsTest", () => {
  it("to fs db", () => {
    const collection = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(toFs([], ":db")).toBe("null");
    expect(toFs(collection, ":db")).toBe("1,2,3");
    expect(toFormattedS([], ":db")).toBe("null");
    expect(toFormattedS([{ id: 4 }, { id: 5 }, { id: 6 }], ":db")).toBe("4,5,6");
  });
});

describe("ToXmlTest", () => {
  it.skip("to xml with hash elements");

  it.skip("to xml with non hash elements");

  it.skip("to xml with non hash different type elements");

  it.skip("to xml with dedicated name");

  it.skip("to xml with options");

  it.skip("to xml with indent set");

  it.skip("to xml with dasherize false");

  it.skip("to xml with dasherize true");

  it.skip("to xml with instruct");

  it.skip("to xml with block");

  it.skip("to xml with empty");

  it.skip("to xml dups options");
});
