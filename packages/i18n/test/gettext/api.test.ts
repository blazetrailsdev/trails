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

  it("N_returns_original_msg", () => {
    expect(Helpers.N_("foo|bar")).toBe("foo|bar");
    setLocale("de");
    expect(Helpers.N_("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext_uses_msg_as_default", () => {
    expect(Helpers._("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext_uses_msg_as_key", () => {
    setLocale("de");
    expect(Helpers.gettext("Hi Gettext!")).toBe("Hallo Gettext!");
    expect(Helpers._("Hi Gettext!")).toBe("Hallo Gettext!");
  });

  it("gettext_uses_msg_containing_dots_as_default", () => {
    expect(Helpers.gettext("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
    expect(Helpers._("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
  });

  it("gettext_uses_msg_containing_dots_as_key", () => {
    setLocale("de");
    expect(Helpers.gettext("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
    expect(Helpers._("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
  });

  it("sgettext_defaults_to_the_last_token_of_a_scoped_msgid", () => {
    expect(Helpers.sgettext("foo|bar")).toBe("bar");
    expect(Helpers.s_("foo|bar")).toBe("bar");
  });

  it("sgettext_looks_up_a_scoped_translation", () => {
    setLocale("de");
    expect(Helpers.sgettext("foo|bar")).toBe("bar-de");
    expect(Helpers.s_("foo|bar")).toBe("bar-de");
  });

  it("sgettext_ignores_dots", () => {
    setLocale("de");
    expect(Helpers.sgettext("foo.bar")).toBe("Foo Bar");
    expect(Helpers.s_("foo.bar")).toBe("Foo Bar");
  });

  it("pgettext_defaults_to_msgid", () => {
    expect(Helpers.pgettext("foo", "bar")).toBe("bar");
    expect(Helpers.p_("foo", "bar")).toBe("bar");
  });

  it("pgettext_looks_up_a_scoped_translation", () => {
    setLocale("de");
    expect(Helpers.pgettext("foo", "bar")).toBe("bar-de");
    expect(Helpers.p_("foo", "bar")).toBe("bar-de");
  });

  it("ngettext_looks_up_msg_id_as_default_singular", () => {
    expect(Helpers.ngettext("An apple", "%{count} apples", 1)).toBe("An apple");
    expect(Helpers.n_("An apple", "%{count} apples", 1)).toBe("An apple");
  });

  it("ngettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(Helpers.ngettext("An apple", "%{count} apples", 2)).toBe("2 apples");
    expect(Helpers.n_("An apple", "%{count} apples", 2)).toBe("2 apples");
  });

  it("ngettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(Helpers.ngettext("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
    expect(Helpers.n_("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
  });

  it("ngettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(Helpers.ngettext("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
    expect(Helpers.n_("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
  });

  it("ngettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 1)).toBe("An apple");
    expect(Helpers.n_(["An apple", "%{count} apples"], 1)).toBe("An apple");
  });

  it("ngettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 2)).toBe("2 apples");
    expect(Helpers.n_(["An apple", "%{count} apples"], 2)).toBe("2 apples");
  });

  it("ngettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
    expect(Helpers.n_(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
  });

  it("ngettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.ngettext(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
    expect(Helpers.n_(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
  });

  it("nsgettext_looks_up_msg_id_as_default_singular", () => {
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
  });

  it("nsgettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
  });

  it("nsgettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(Helpers.nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.ns_("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("nsgettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
  });

  it("nsgettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
  });

  it("nsgettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.ns_(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext_looks_up_msg_id_as_default_singular", () => {
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
  });

  it("npgettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
  });

  it("npgettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(Helpers.npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(Helpers.np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });
});
