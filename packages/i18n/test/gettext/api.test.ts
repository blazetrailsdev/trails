import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as TestCase from "../support/test-case.js";
import { config, setLocale } from "../../lib/i18n.js";
import { Helpers } from "../../lib/gettext/helpers.js";

const { N_, gettext, _, sgettext, s_, pgettext, p_, ngettext, n_, nsgettext, ns_, npgettext, np_ } =
  Helpers;

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
    expect(N_("foo|bar")).toBe("foo|bar");
    setLocale("de");
    expect(N_("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext_uses_msg_as_default", () => {
    expect(_("Hi Gettext!")).toBe("Hi Gettext!");
  });

  it("gettext_uses_msg_as_key", () => {
    setLocale("de");
    expect(gettext("Hi Gettext!")).toBe("Hallo Gettext!");
    expect(_("Hi Gettext!")).toBe("Hallo Gettext!");
  });

  it("gettext_uses_msg_containing_dots_as_default", () => {
    expect(gettext("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
    expect(_("Sentence 1. Sentence 2.")).toBe("Sentence 1. Sentence 2.");
  });

  it("gettext_uses_msg_containing_dots_as_key", () => {
    setLocale("de");
    expect(gettext("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
    expect(_("Sentence 1. Sentence 2.")).toBe("Satz 1. Satz 2.");
  });

  it("sgettext_defaults_to_the_last_token_of_a_scoped_msgid", () => {
    expect(sgettext("foo|bar")).toBe("bar");
    expect(s_("foo|bar")).toBe("bar");
  });

  it("sgettext_looks_up_a_scoped_translation", () => {
    setLocale("de");
    expect(sgettext("foo|bar")).toBe("bar-de");
    expect(s_("foo|bar")).toBe("bar-de");
  });

  it("sgettext_ignores_dots", () => {
    setLocale("de");
    expect(sgettext("foo.bar")).toBe("Foo Bar");
    expect(s_("foo.bar")).toBe("Foo Bar");
  });

  it("pgettext_defaults_to_msgid", () => {
    expect(pgettext("foo", "bar")).toBe("bar");
    expect(p_("foo", "bar")).toBe("bar");
  });

  it("pgettext_looks_up_a_scoped_translation", () => {
    setLocale("de");
    expect(pgettext("foo", "bar")).toBe("bar-de");
    expect(p_("foo", "bar")).toBe("bar-de");
  });

  it("ngettext_looks_up_msg_id_as_default_singular", () => {
    expect(ngettext("An apple", "%{count} apples", 1)).toBe("An apple");
    expect(n_("An apple", "%{count} apples", 1)).toBe("An apple");
  });

  it("ngettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(ngettext("An apple", "%{count} apples", 2)).toBe("2 apples");
    expect(n_("An apple", "%{count} apples", 2)).toBe("2 apples");
  });

  it("ngettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(ngettext("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
    expect(n_("An apple", "%{count} apples", 1)).toBe("Ein Apfel");
  });

  it("ngettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(ngettext("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
    expect(n_("An apple", "%{count} apples", 2)).toBe("2 Äpfel");
  });

  it("ngettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(ngettext(["An apple", "%{count} apples"], 1)).toBe("An apple");
    expect(n_(["An apple", "%{count} apples"], 1)).toBe("An apple");
  });

  it("ngettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(ngettext(["An apple", "%{count} apples"], 2)).toBe("2 apples");
    expect(n_(["An apple", "%{count} apples"], 2)).toBe("2 apples");
  });

  it("ngettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(ngettext(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
    expect(n_(["An apple", "%{count} apples"], 1)).toBe("Ein Apfel");
  });

  it("ngettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(ngettext(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
    expect(n_(["An apple", "%{count} apples"], 2)).toBe("2 Äpfel");
  });

  it("nsgettext_looks_up_msg_id_as_default_singular", () => {
    expect(nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(ns_("special|A special apple", "%{count} special apples", 1)).toBe("A special apple");
  });

  it("nsgettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(ns_("special|A special apple", "%{count} special apples", 2)).toBe("2 special apples");
  });

  it("nsgettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(nsgettext("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(ns_("special|A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(nsgettext("special|A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(ns_("special|A special apple", "%{count} special apples", 2)).toBe("2 spezielle Äpfel");
  });

  it("nsgettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(ns_(["special|A special apple", "%{count} special apples"], 1)).toBe("A special apple");
  });

  it("nsgettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(ns_(["special|A special apple", "%{count} special apples"], 2)).toBe("2 special apples");
  });

  it("nsgettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(nsgettext(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(ns_(["special|A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("nsgettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(nsgettext(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(ns_(["special|A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext_looks_up_msg_id_as_default_singular", () => {
    expect(npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "A special apple",
    );
    expect(np_("special", "A special apple", "%{count} special apples", 1)).toBe("A special apple");
  });

  it("npgettext_looks_up_msg_id_plural_as_default_plural", () => {
    expect(npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
    expect(np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext_looks_up_a_singular", () => {
    setLocale("de");
    expect(npgettext("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(np_("special", "A special apple", "%{count} special apples", 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext_looks_up_a_plural", () => {
    setLocale("de");
    expect(npgettext("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(np_("special", "A special apple", "%{count} special apples", 2)).toBe(
      "2 spezielle Äpfel",
    );
  });

  it("npgettext_looks_up_msg_id_as_default_singular_with_alternative_syntax", () => {
    expect(npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
    expect(np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "A special apple",
    );
  });

  it("npgettext_looks_up_msg_id_plural_as_default_plural_with_alternative_syntax", () => {
    expect(npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
    expect(np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 special apples",
    );
  });

  it("npgettext_looks_up_a_singular_with_alternative_syntax", () => {
    setLocale("de");
    expect(npgettext("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
    expect(np_("special", ["A special apple", "%{count} special apples"], 1)).toBe(
      "Ein spezieller Apfel",
    );
  });

  it("npgettext_looks_up_a_plural_with_alternative_syntax", () => {
    setLocale("de");
    expect(npgettext("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
    expect(np_("special", ["A special apple", "%{count} special apples"], 2)).toBe(
      "2 spezielle Äpfel",
    );
  });
});
