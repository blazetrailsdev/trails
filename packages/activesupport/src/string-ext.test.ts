import { describe, it, expect } from "vitest";
import {
  pluralize,
  singularize,
  camelize,
  underscore,
  titleize,
  tableize,
  classify,
  dasherize,
  demodulize,
  deconstantize,
  foreignKey,
  humanize,
  parameterize,
  squish,
  truncate,
  truncateWords,
  stripHeredoc,
  downcaseFirst,
  upcaseFirst,
  at,
  first,
  last,
  from,
  to,
  indent,
} from "./index.js";

describe("StringInflectionsTest", () => {
  it("strip heredoc on an empty string", () => {
    expect(stripHeredoc("")).toBe("");
  });

  it.skip("strip heredoc on a frozen string");

  it("strip heredoc on a string with no lines", () => {
    expect(stripHeredoc("x")).toBe("x");
    expect(stripHeredoc("    x")).toBe("x");
  });

  it("strip heredoc on a heredoc with no margin", () => {
    expect(stripHeredoc("foo\nbar")).toBe("foo\nbar");
    expect(stripHeredoc("foo\n  bar")).toBe("foo\n  bar");
  });

  it("strip heredoc on a regular indented heredoc", () => {
    const input = "      foo\n        bar\n      baz\n";
    expect(stripHeredoc(input)).toBe("foo\n  bar\nbaz\n");
  });

  it("strip heredoc on a regular indented heredoc with blank lines", () => {
    const input = "      foo\n        bar\n\n      baz\n";
    expect(stripHeredoc(input)).toBe("foo\n  bar\n\nbaz\n");
  });

  it("pluralize", () => {
    expect(pluralize("search")).toBe("searches");
    expect(pluralize("switch")).toBe("switches");
    expect(pluralize("fix")).toBe("fixes");
    expect(pluralize("category")).toBe("categories");
    expect(pluralize("plurals")).toBe("plurals");
  });

  it.skip("pluralize with count = 1 still returns new string");

  it("singularize", () => {
    expect(singularize("searches")).toBe("search");
    expect(singularize("switches")).toBe("switch");
    expect(singularize("fixes")).toBe("fix");
    expect(singularize("categories")).toBe("category");
  });

  it("titleize", () => {
    expect(titleize("active_record")).toBe("Active Record");
    expect(titleize("ActiveRecord")).toBe("Active Record");
    expect(titleize("action web service")).toBe("Action Web Service");
  });

  it.skip("titleize with keep id suffix");

  it("downcase first", () => {
    expect(downcaseFirst("Try again")).toBe("try again");
  });

  it("downcase first with one char", () => {
    expect(downcaseFirst("T")).toBe("t");
  });

  it("downcase first with empty string", () => {
    expect(downcaseFirst("")).toBe("");
  });

  it("upcase first", () => {
    expect(upcaseFirst("what a Lovely Day")).toBe("What a Lovely Day");
  });

  it("upcase first with one char", () => {
    expect(upcaseFirst("w")).toBe("W");
  });

  it("upcase first with empty string", () => {
    expect(upcaseFirst("")).toBe("");
  });

  it("camelize", () => {
    expect(camelize("product")).toBe("Product");
    expect(camelize("special_guest")).toBe("SpecialGuest");
    expect(camelize("application_controller")).toBe("ApplicationController");
    expect(camelize("area51_controller")).toBe("Area51Controller");
  });

  it("camelize lower", () => {
    expect(camelize("Capital", false)).toBe("capital");
  });

  it.skip("camelize upper");

  it.skip("camelize invalid option");

  it("dasherize", () => {
    expect(dasherize("street")).toBe("street");
    expect(dasherize("street_address")).toBe("street-address");
    expect(dasherize("person_street_address")).toBe("person-street-address");
  });

  it("underscore", () => {
    expect(underscore("HTMLTidy")).toBe("html_tidy");
    expect(underscore("HTMLTidyGenerator")).toBe("html_tidy_generator");
  });

  it("underscore to lower camel", () => {
    expect(camelize("product", false)).toBe("product");
    expect(camelize("special_guest", false)).toBe("specialGuest");
    expect(camelize("application_controller", false)).toBe("applicationController");
    expect(camelize("area51_controller", false)).toBe("area51Controller");
  });

  it("demodulize", () => {
    expect(demodulize("MyApplication::Billing::Account")).toBe("Account");
  });

  it("deconstantize", () => {
    expect(deconstantize("MyApplication::Billing::Account")).toBe("MyApplication::Billing");
  });

  it("foreign key", () => {
    expect(foreignKey("Person")).toBe("person_id");
    expect(foreignKey("MyApplication::Billing::Account")).toBe("account_id");
    expect(foreignKey("Person", false)).toBe("personid");
    expect(foreignKey("MyApplication::Billing::Account", false)).toBe("accountid");
  });

  it("tableize", () => {
    expect(tableize("PrimarySpokesman")).toBe("primary_spokesmen");
    expect(tableize("NodeChild")).toBe("node_children");
  });

  it("classify", () => {
    expect(classify("primary_spokesmen")).toBe("PrimarySpokesman");
    expect(classify("node_children")).toBe("NodeChild");
  });

  it("string parameterized normal", () => {
    expect(parameterize("Random text with *(bad)* characters")).toBe(
      "random-text-with-bad-characters",
    );
    expect(parameterize("Allow_Under_Scores")).toBe("allow_under_scores");
    expect(parameterize("Trailing bad characters!@#")).toBe("trailing-bad-characters");
    expect(parameterize("!@#Leading bad characters")).toBe("leading-bad-characters");
    expect(parameterize("Squeeze   separators")).toBe("squeeze-separators");
    expect(parameterize("Test with + sign")).toBe("test-with-sign");
  });

  it("string parameterized normal preserve case", () => {
    expect(parameterize("Donald E. Knuth", { preserveCase: true })).toBe("Donald-E-Knuth");
  });

  it.skip("string parameterized no separator");

  it.skip("string parameterized no separator preserve case");

  it("string parameterized underscore", () => {
    expect(parameterize("Donald E. Knuth", { separator: "_" })).toBe("donald_e_knuth");
    expect(parameterize("Random text with *(bad)* characters", { separator: "_" })).toBe(
      "random_text_with_bad_characters",
    );
    expect(parameterize("Trailing bad characters!@#", { separator: "_" })).toBe(
      "trailing_bad_characters",
    );
    expect(parameterize("Squeeze   separators", { separator: "_" })).toBe("squeeze_separators");
  });

  it.skip("string parameterized underscore preserve case");

  it.skip("parameterize with locale");

  it("humanize", () => {
    expect(humanize("employee_salary")).toBe("Employee salary");
    expect(humanize("employee_id")).toBe("Employee");
    expect(humanize("underground")).toBe("Underground");
    expect(humanize("author_id")).toBe("Author");
  });

  it("humanize without capitalize", () => {
    expect(humanize("employee_salary", { capitalize: false })).toBe("employee salary");
    expect(humanize("employee_id", { capitalize: false })).toBe("employee");
    expect(humanize("underground", { capitalize: false })).toBe("underground");
  });

  it.skip("humanize with keep id suffix");

  it.skip("humanize with html escape");

  it.skip("ord");

  it.skip("starts ends with alias");

  it("string squish", () => {
    expect(squish("  foo   bar  \n  baz  ")).toBe("foo bar baz");
  });

  it.skip("string inquiry");

  it("truncate", () => {
    expect(truncate("Hello World!", 12)).toBe("Hello World!");
    expect(truncate("Hello World!!", 12)).toBe("Hello Wor...");
  });

  it.skip("truncate with omission and separator");

  it.skip("truncate with omission and regexp separator");

  it.skip("truncate returns frozen string");

  it.skip("truncate bytes");

  it.skip("truncate bytes preserves codepoints");

  it.skip("truncates bytes preserves grapheme clusters");

  it.skip("truncates bytes preserves encoding");

  it("truncate words", () => {
    expect(truncateWords("Hello Big World!", 3)).toBe("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2)).toBe("Hello Big...");
  });

  it("truncate words with omission", () => {
    expect(truncateWords("Hello Big World!", 3, { omission: "[...]" })).toBe("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2, { omission: "[...]" })).toBe("Hello Big[...]");
  });

  it.skip("truncate words with separator");

  it.skip("truncate words with separator and omission");

  it.skip("truncate words with complex string");

  it.skip("truncate multibyte");

  it.skip("truncate should not be html safe");

  it.skip("remove");

  it.skip("remove for multiple occurrences");

  it.skip("remove!");

  it.skip("constantize");

  it.skip("safe constantize");
});
