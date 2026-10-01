import { describe, expect, it } from "vitest";
import { rbMethodName, stringToSym } from "./symbol.js";

describe("rbMethodName", () => {
  it("inverts the predicate, bang, operator and camelCase spellings", () => {
    expect(rbMethodName("isEmpty")).toBe("empty?");
    expect(rbMethodName("saveBang")).toBe("save!");
    expect(rbMethodName("plus")).toBe("+");
    expect(rbMethodName("equals")).toBe("==");
    expect(rbMethodName("toS")).toBe("to_s");
    expect(rbMethodName("fooBar")).toBe("foo_bar");
    expect(rbMethodName("hasKey")).toBe("has_key?");
    expect(rbMethodName("supportsDdlTransactions")).toBe("supports_ddl_transactions?");
  });
});

describe("stringToSym", () => {
  it("spells a String's Symbol with its colon and leaves a Symbol alone", () => {
    expect(stringToSym("too_short")).toBe(":too_short");
    expect(stringToSym(":too_short")).toBe(":too_short");
  });

  it("has no answer for nil, which defines no to_sym", () => {
    expect(() => stringToSym(undefined as unknown as string)).toThrow(TypeError);
  });
});
