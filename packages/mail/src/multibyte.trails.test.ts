import { Range } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Chars } from "./multibyte/chars.js";
import { Unicode } from "./multibyte/unicode.js";

describe("Mail::Multibyte::Chars (trails)", () => {
  it("titleizes the chars.rb doc example", () => {
    expect(new Chars("ÉL QUE SE ENTERÓ").titleize().toS()).toBe("Él Que Se Enteró");
    expect(new Chars("日本語").titleize().toS()).toBe("日本語");
  });

  it("limits by bytes without breaking characters", () => {
    expect(new Chars("こんにちは").limit(7)!.toS()).toBe("こん");
    expect(new Chars("こんにちは").limit(0)!.toS()).toBe("");
  });

  it("slices by codepoint", () => {
    expect(new Chars("こんにちは").slice(new Range(2, 3))!.toS()).toBe("にち");
    expect(new Chars("Café").slice(3)!.toS()).toBe("é");
    expect(new Chars("abc").slice(/(b)(c)/g, 2)!.toS()).toBe("c");
  });

  it("splits into Chars", () => {
    const parts = new Chars("Café périferôl").split(/é/);
    expect(parts.map((p) => (p as Chars).upcase().toS())).toEqual(["CAF", " P", "RIFERÔL"]);
  });

  it("sets by character offset, range, needle and regexp", () => {
    const a = new Chars("Müller");
    a.set(2, "e");
    expect(a.toS()).toBe("Müeler");
    const b = new Chars("Müller");
    b.set(1, 2, "ö");
    expect(b.toS()).toBe("Möler");
    const c = new Chars("Müller");
    c.set(new Range(-2, -1), "xy");
    expect(c.toS()).toBe("Müllxy");
    const d = new Chars("Müller");
    d.set("ll", "$&");
    expect(d.toS()).toBe("Mü$&er");
    const e = new Chars("aXbX");
    e.set(/X/g, "-");
    expect(e.toS()).toBe("a-bX");
    expect(() => new Chars("abc").set("z", "q")).toThrow("undefined method '+' for nil");
  });

  it("reverses, capitalizes and normalizes", () => {
    expect(new Chars("Café").reverse().toS()).toBe("éfaC");
    expect(new Chars("über").capitalize().toS()).toBe("Über");
    expect(Unicode.normalize("ﬁ")).toBe("fi");
    expect(new Chars("क्षि").gLength()).toBe(3);
    expect(Unicode.gUnpack("क्षि")).toEqual([[2325, 2381], [2359], [2367]]);
    expect(Unicode.gUnpack("\r\n각")).toEqual([[13, 10], [44033]]);
  });

  it("strips with the LEADERS_PAT / TRAILERS_PAT whitespace set", () => {
    expect(" 　x﻿".replace(Unicode.LEADERS_PAT, "").replace(Unicode.TRAILERS_PAT, "")).toBe("x");
  });
});
