import { describe, it, expect } from "vitest";
import { Date, DateTime } from "./date.js";
import { Rational } from "@blazetrails/ruby-compat";

describe("TestDateCompat", () => {
  it("compat", () => {
    expect(new DateTime().equals(new Date())).toBe(true);
    expect(new DateTime(2002, 3, 19).equals(new Date(2002, 3, 19))).toBe(true);
    expect(new DateTime(2002, 3, 19, 0, 0, 0).equals(new Date(2002, 3, 19))).toBe(true);
    expect(new DateTime(2002, 3, 19, 0, 0, 0, 0).equals(new Date(2002, 3, 19))).toBe(true);
    expect(
      new DateTime(2002, 3, 19, 0, 0, 0, new Rational(0, 1)).equals(new Date(2002, 3, 19)),
    ).toBe(true);
    expect(
      new DateTime(2002, 3, 19, 0, 0, 0, 0, Date.GREGORIAN).equals(
        new Date(2002, 3, 19, Date.GREGORIAN),
      ),
    ).toBe(true);
    expect(
      new DateTime(2002, 3, 19, 0, 0, 0, 0, Date.JULIAN).equals(new Date(2002, 3, 19, Date.JULIAN)),
    ).toBe(true);

    expect(!new Date(2002, 3, 19).equals(new DateTime(2002, 3, 19, 12, 0, 0))).toBeTruthy();
    expect(!new Date(2002, 3, 19).equals(new DateTime(2002, 3, 19, 0, 0, 1))).toBeTruthy();
    expect(new Date(2002, 3, 19).caseEquals(new DateTime(2002, 3, 19, 12, 0, 0))).toBeTruthy();
    expect(new Date(2002, 3, 19).caseEquals(new DateTime(2002, 3, 19, 0, 0, 1))).toBeTruthy();
  });
});
