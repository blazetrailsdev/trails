import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as TestCase from "../support/test-case.js";
import { config, setLocale } from "../../lib/i18n.js";
import { Helpers } from "../../lib/gettext/helpers.js";

describe("I18nGettextApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    setLocale("en");
    config().backend.storeTranslations(
      "de",
      {
        "Hi Gettext!": "Hallo Gettext!",
        "Sentence 1. Sentence 2.": "Satz 1. Satz 2.",
        "An apple": { one: "Ein Apfel", other: "%{count} Äpfel" },
        special: {
          "A special apple": { one: "Ein spezieller Apfel", other: "%{count} spezielle Äpfel" },
        },
        foo: { bar: "bar-de" },
        "foo.bar": "Foo Bar",
      },
      { separator: "|" },
    );
  });
  afterEach(TestCase.teardown);

  it("N returns original msg", () => {
    expect(Helpers.N_("foo|bar")).toBe("foo|bar");
    setLocale("de");
    expect(Helpers.N_("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext uses msg as default", () => {
    expect(Helpers._("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext uses msg as key", () => {
    setLocale("de");
    expect(Helpers.gettext("Hi Gettext!")).toBe("Hallo Gettext!");
    expect(Helpers._("Hi Gettext!")).toBe("Hallo Gettext!");
  });

  it("gettext uses msg containing dots as default", () => {
    expect(Helpers.gettext("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
    expect(Helpers._("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
  });

  it("gettext uses msg containing dots as key", () => {
    setLocale("de");
    expect(Helpers.gettext("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
    expect(Helpers._("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
  });

  it("sgettext defaults to the last token of a scoped msgid", () => {
    expect(Helpers.sgettext("foo|bar")).toBe("bar");
    expect(Helpers.s_("foo|bar")).toBe("bar");
  });

  it("sgettext looks up a scoped translation", () => {
    setLocale("de");
    expect(Helpers.sgettext("foo|bar")).toBe("bar-de");
    expect(Helpers.s_("foo|bar")).toBe("bar-de");
  });

  it("sgettext ignores dots", () => {
    setLocale("de");
    expect(Helpers.sgettext("foo.bar")).toBe("Foo Bar");
    expect(Helpers.s_("foo.bar")).toBe("Foo Bar");
  });

  it("pgettext defaults to msgid", () => {
    expect(Helpers.pgettext("foo", "bar")).toBe("bar");
    expect(Helpers.p_("foo", "bar")).toBe("bar");
  });

  it("pgettext looks up a scoped translation", () => {
    setLocale("de");
    expect(Helpers.pgettext("foo", "bar")).toBe("bar-de");
    expect(Helpers.p_("foo", "bar")).toBe("bar-de");
  });

  it("ngettext looks up msg id as default singular", () => {
    expect(Helpers.ngettext("An apple", "%{count} apples", 1)).toBe("An apple");
    expect(Helpers.n_("An apple", "%{count} apples", 1)).toBe("An apple");
  });

  it("ngettext looks up msg id plural as default plural", () => {
    expect(Helpers.ngettext("An apple", "%{count} apples", 2)).toBe("2 apples");
    expect(Helpers.n_("An apple", "%{count} apples", 2)).toBe("2 apples");
  });

  it("ngettext looks up a singular", () => {
    setLocale("de");
    expect(Helpers.ngettext("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
    expect(Helpers.n_("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
  });

  it("ngettext looks up a plural", () => {
    setLocale("de");
    expect(Helpers.ngettext("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
    expect(Helpers.n_("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
  });

  it("ngettext looks up msg id as default singular with alternative syntax", () => {
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 1)).toBe("An apple");
    expect(Helpers.n_(["An apple", "%{count} apples"], 1)).toBe("An apple");
  });

  it("ngettext looks up msg id plural as default plural with alternative syntax", () => {
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 2)).toBe("2 apples");
    expect(Helpers.n_(["An apple", "%{count} apples"], 2)).toBe("2 apples");
  });

  it("ngettext looks up a singular with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
    expect(Helpers.n_(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
  });

  it("ngettext looks up a plural with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
    expect(Helpers.n_(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
  });

  it("nsgettext looks up msg id as default singular", () => {
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
  });

  it("nsgettext looks up msg id plural as default plural", () => {
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
  });

  it("nsgettext looks up a singular", () => {
    setLocale("de");
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext looks up a plural", () => {
    setLocale("de");
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("nsgettext looks up msg id as default singular with alternative syntax", () => {
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
  });

  it("nsgettext looks up msg id plural as default plural with alternative syntax", () => {
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
  });

  it("nsgettext looks up a singular with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext looks up a plural with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext looks up msg id as default singular", () => {
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
  });

  it("npgettext looks up msg id plural as default plural", () => {
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext looks up a singular", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext looks up a plural", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext looks up msg id as default singular with alternative syntax", () => {
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
  });

  it("npgettext looks up msg id plural as default plural with alternative syntax", () => {
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext looks up a singular with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext looks up a plural with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });
});
