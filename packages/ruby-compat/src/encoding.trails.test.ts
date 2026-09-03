import { describe, it, expect } from "vitest";
import { Encoding } from "./encoding.js";
import { ArgumentError } from "./argument-error.js";

describe("Encoding.find", () => {
  it("resolves a canonical Ruby name to its Encoding", () => {
    expect(Encoding.find("UTF-8").name).toBe("UTF-8");
    expect(Encoding.find("Shift_JIS").name).toBe("Shift_JIS");
  });

  it("is case-insensitive, as enc_registered's case-folding table is", () => {
    expect(Encoding.find("utf-8")).toBe(Encoding.UTF_8);
    expect(Encoding.find("SHIFT_JIS").name).toBe("Shift_JIS");
  });

  it("resolves a Ruby alias to its canonical encoding", () => {
    expect(Encoding.find("BINARY")).toBe(Encoding.ASCII_8BIT);
    expect(Encoding.find("CP932").name).toBe("Windows-31J");
    expect(Encoding.find("646")).toBe(Encoding.US_ASCII);
    expect(Encoding.find("ISO8859-15").name).toBe("ISO-8859-15");
  });

  it("resolves the names TextDecoder rejects", () => {
    for (const name of ["ASCII-8BIT", "BINARY", "CP932", "CP949", "646"]) {
      expect(() => new TextDecoder(name)).toThrow();
      expect(Encoding.find(name)).toBeInstanceOf(Encoding);
    }
  });

  it("rejects a WHATWG-only label Ruby does not register", () => {
    expect(new TextDecoder("unicode-1-1-utf-8").encoding).toBe("utf-8");
    expect(() => Encoding.find("unicode-1-1-utf-8")).toThrow(ArgumentError);
  });

  it("raises ArgumentError: unknown encoding name - <name>", () => {
    expect(() => Encoding.find("no-such-encoding")).toThrow(
      "unknown encoding name - no-such-encoding",
    );
  });

  it("returns an Encoding argument unchanged, as enc_find's is_obj_encoding arm does", () => {
    expect(Encoding.find(Encoding.UTF_8)).toBe(Encoding.UTF_8);
  });

  it("renders as its name, and inspects as #<Encoding:name>", () => {
    expect(String(Encoding.UTF_8)).toBe("UTF-8");
    expect(Encoding.UTF_8.inspect()).toBe("#<Encoding:UTF-8>");
  });
});
