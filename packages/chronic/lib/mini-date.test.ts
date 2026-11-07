import type {} from "@blazetrails/vitest-matchers";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestMiniDate", () => {
  it("valid month", () => {
    expect(() => new Chronic.MiniDate(0, 12)).toThrow(ArgumentError);
    expect(() => new Chronic.MiniDate(13, 1)).toThrow(ArgumentError);
  });

  it("is between", () => {
    let m = new Chronic.MiniDate(3, 2);
    expect(m.isBetween(new Chronic.MiniDate(2, 4), new Chronic.MiniDate(4, 7))).toBeTruthy();
    expect(!m.isBetween(new Chronic.MiniDate(1, 5), new Chronic.MiniDate(2, 7))).toBeTruthy();

    m = new Chronic.MiniDate(12, 24);
    expect(!m.isBetween(new Chronic.MiniDate(10, 1), new Chronic.MiniDate(12, 21))).toBeTruthy();
  });

  it("is between short range", () => {
    const m = new Chronic.MiniDate(5, 10);
    expect(m.isBetween(new Chronic.MiniDate(5, 3), new Chronic.MiniDate(5, 12))).toBeTruthy();
    expect(!m.isBetween(new Chronic.MiniDate(5, 11), new Chronic.MiniDate(5, 15))).toBeTruthy();
  });

  it("is between wrapping range", () => {
    let m = new Chronic.MiniDate(1, 1);
    expect(m.isBetween(new Chronic.MiniDate(11, 11), new Chronic.MiniDate(2, 2))).toBeTruthy();
    m = new Chronic.MiniDate(12, 12);
    expect(m.isBetween(new Chronic.MiniDate(11, 11), new Chronic.MiniDate(1, 5))).toBeTruthy();
  });
});
