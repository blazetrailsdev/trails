import { expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { InvalidPluralizationData } from "../../../lib/exceptions.js";
import { t } from "../../../lib/i18n.js";

export function testsPluralization(): void {
  it("pluralization: given 0 it returns the :zero translation if it is defined", () => {
    expect(t(null, { default: new Hash().set(":zero", "zero"), count: 0 })).toBe("zero");
  });

  it("pluralization: given 0 it returns the :other translation if :zero is not defined", () => {
    expect(t(null, { default: new Hash().set(":other", "bars"), count: 0 })).toBe("bars");
  });

  it("pluralization: given 1 it returns the singular translation", () => {
    expect(t(null, { default: new Hash().set(":one", "bar"), count: 1 })).toBe("bar");
  });

  it("pluralization: given 2 it returns the :other translation", () => {
    expect(t(null, { default: new Hash().set(":other", "bars"), count: 2 })).toBe("bars");
  });

  it("pluralization: given 3 it returns the :other translation", () => {
    expect(t(null, { default: new Hash().set(":other", "bars"), count: 3 })).toBe("bars");
  });

  it("pluralization: given nil it returns the whole entry", () => {
    expect(t(null, { default: new Hash().set(":one", "bar"), count: null })).toEqual(
      new Hash().set(":one", "bar"),
    );
  });

  it("pluralization: given incomplete pluralization data it raises I18n::InvalidPluralizationData", () => {
    expect(() => t(null, { default: new Hash().set(":one", "bar"), count: 2 })).toThrow(
      InvalidPluralizationData,
    );
  });
}
