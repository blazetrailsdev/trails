import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as TestCase from "./support/test-case.js";
import { Gettext } from "../lib/gettext.js";

describe("I18nGettextPluralKeysTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    Gettext.pluralKeys().zz = ["value1", "value2"];
  });
  afterEach(TestCase.teardown);

  it("Returns the plural keys of the given locale if present", () => {
    expect(Gettext.pluralKeys("zz")).toEqual(["value1", "value2"]);
  });

  it("Returns the plural keys of :en if given locale not present", () => {
    expect(Gettext.pluralKeys("yy")).toEqual(["one", "other"]);
  });

  it("Returns the whole hash with no arguments", () => {
    expect(Gettext.pluralKeys()).toEqual({ en: ["one", "other"], zz: ["value1", "value2"] });
  });
});
