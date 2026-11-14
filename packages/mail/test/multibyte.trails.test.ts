import { Range } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Chars } from "../lib/multibyte/chars.js";
import { Unicode } from "../lib/multibyte/unicode.js";

describe("Mail::Multibyte::Chars (trails)", () => {
  it("titleizes the chars.rb doc example", () => {
    expect(new Chars("ÉL QUE SE ENTERÓ").titleize().toString()).toBe("Él Que Se Enteró");
    expect(new Chars("日本語").titleize().toString()).toBe("日本語");
  });

  it("limits by bytes without breaking characters", () => {
    expect(new Chars("こんにちは").limit(7)!.toString()).toBe("こん");
    expect(new Chars("こんにちは").limit(0)!.toString()).toBe("");
  });

  it("slices by codepoint", () => {
    expect(new Chars("こんにちは").slice(new Range(2, 3))!.toString()).toBe("にち");
    expect(new Chars("Café").slice(3)!.toString()).toBe("é");
    expect(new Chars("abc").slice(/(b)(c)/g, 2)!.toString()).toBe("c");
  });

  it("splits into Chars", () => {
    const parts = new Chars("Café périferôl").split(/é/);
    expect(parts.map((p) => (p as Chars).upcase().toString())).toEqual(["CAF", " P", "RIFERÔL"]);
  });

  it("sets by character offset, range, needle and regexp", () => {
    const a = new Chars("Müller");
    a.set(2, "e");
    expect(a.toString()).toBe("Müeler");
    const b = new Chars("Müller");
    b.set(1, 2, "ö");
    expect(b.toString()).toBe("Möler");
    const c = new Chars("Müller");
    c.set(new Range(-2, -1), "xy");
    expect(c.toString()).toBe("Müllxy");
    const d = new Chars("Müller");
    d.set("ll", "$&");
    expect(d.toString()).toBe("Mü$&er");
    const e = new Chars("aXbX");
    e.set(/X/g, "-");
    expect(e.toString()).toBe("a-bX");
    expect(() => new Chars("abc").set("z", "q")).toThrow("undefined method '+' for nil");
  });

  it("reverses, capitalizes and normalizes", () => {
    expect(new Chars("Café").reverse().toString()).toBe("éfaC");
    expect(new Chars("über").capitalize().toString()).toBe("Über");
    expect(Unicode.normalize("ﬁ")).toBe("fi");
    expect(new Chars("क्षि").gLength()).toBe(3);
    expect(Unicode.gUnpack("क्षि")).toEqual([[2325, 2381], [2359], [2367]]);
    expect(Unicode.gUnpack("\r\n각")).toEqual([[13, 10], [44033]]);
  });

  it("strips with the LEADERS_PAT / TRAILERS_PAT whitespace set", () => {
    expect(" 　x﻿".replace(Unicode.LEADERS_PAT, "").replace(Unicode.TRAILERS_PAT, "")).toBe("x");
  });
});

describe("Unicode.applyMapping", () => {
  it("reads the simple mapping where the full one differs", () => {
    expect(Unicode.applyMapping("ǅ", ":uppercase_mapping")).toBe("Ǆ");
    expect(Unicode.applyMapping("ǅ", ":lowercase_mapping")).toBe("ǆ");
    expect(Unicode.applyMapping("ß", ":uppercase_mapping")).toBe("ß");
    expect(Unicode.applyMapping("aÉ", ":uppercase_mapping")).toBe("AÉ");
  });
});

describe("Mail::Multibyte::Chars method_missing (trails)", () => {
  it("wraps a String result of a forwarded String method in Chars", () => {
    const chars = new Chars("(abc)") as unknown as { replace(re: RegExp, s: string): unknown };
    expect(chars.replace(/[()]/g, "")).toBeInstanceOf(Chars);
    expect(String(chars.replace(/[()]/g, ""))).toBe("abc");
  });
});

describe("Mail::Multibyte::Chars bang method_missing (trails)", () => {
  it("mutates the wrapped string and returns self for a forwarded bang", () => {
    const chars = new Chars("(abc)");
    const result = (chars as unknown as { gsubBang(re: RegExp, s: string): unknown }).gsubBang(
      /[()]/g,
      "",
    );
    expect(result).toBe(chars);
    expect(chars.wrappedString).toBe("abc");
  });
});
