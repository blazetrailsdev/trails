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
  isBlank,
  isPresent,
  presence,
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

  it.skip("strip heredoc on a frozen string", () => {
    // Not applicable to TypeScript (no frozen strings)
  });

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

  it.skip("pluralize with count = 1 still returns new string", () => {
    // Requires pluralize(word, count) API
  });

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

  it.skip("titleize with keep id suffix", () => {
    // Requires keep_id_suffix option
  });

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

  it.skip("camelize upper", () => {
    // Requires :upper symbol support
  });

  it.skip("camelize invalid option", () => {
    // Requires ArgumentError for invalid camelize option
  });

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
    expect(parameterize("Random text with *(bad)* characters")).toBe("random-text-with-bad-characters");
    expect(parameterize("Allow_Under_Scores")).toBe("allow_under_scores");
    expect(parameterize("Trailing bad characters!@#")).toBe("trailing-bad-characters");
    expect(parameterize("!@#Leading bad characters")).toBe("leading-bad-characters");
    expect(parameterize("Squeeze   separators")).toBe("squeeze-separators");
    expect(parameterize("Test with + sign")).toBe("test-with-sign");
  });

  it("string parameterized normal preserve case", () => {
    expect(parameterize("Donald E. Knuth", { preserveCase: true })).toBe("Donald-E-Knuth");
  });

  it.skip("string parameterized no separator", () => {
    // Requires separator: "" support
  });

  it.skip("string parameterized no separator preserve case", () => {
    // Requires separator: "" + preserveCase support
  });

  it("string parameterized underscore", () => {
    expect(parameterize("Donald E. Knuth", { separator: "_" })).toBe("donald_e_knuth");
    expect(parameterize("Random text with *(bad)* characters", { separator: "_" })).toBe("random_text_with_bad_characters");
    expect(parameterize("Trailing bad characters!@#", { separator: "_" })).toBe("trailing_bad_characters");
    expect(parameterize("Squeeze   separators", { separator: "_" })).toBe("squeeze_separators");
  });

  it.skip("string parameterized underscore preserve case", () => {
    // Requires separator: "_" + preserveCase support
  });

  it.skip("parameterize with locale", () => {
    // Requires I18n transliteration
  });

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

  it.skip("humanize with keep id suffix", () => {
    // Requires keep_id_suffix option
  });

  it.skip("humanize with html escape", () => {
    // Requires html_safe/ERB integration
  });

  it.skip("ord", () => {
    // Not implemented — Ruby-specific string method
  });

  it.skip("starts ends with alias", () => {
    // Not applicable — JS has startsWith/endsWith natively
  });

  it("string squish", () => {
    expect(squish("  foo   bar  \n  baz  ")).toBe("foo bar baz");
  });

  it.skip("string inquiry", () => {
    // Requires StringInquirer
  });

  it("truncate", () => {
    expect(truncate("Hello World!", 12)).toBe("Hello World!");
    expect(truncate("Hello World!!", 12)).toBe("Hello Wor...");
  });

  it.skip("truncate with omission and separator", () => {
    // Requires separator option for truncate
  });

  it.skip("truncate with omission and regexp separator", () => {
    // Requires regexp separator support
  });

  it.skip("truncate returns frozen string", () => {
    // Not applicable to TypeScript
  });

  it.skip("truncate bytes", () => {
    // Requires truncate_bytes implementation
  });

  it.skip("truncate bytes preserves codepoints", () => {
    // Requires truncate_bytes implementation
  });

  it.skip("truncates bytes preserves grapheme clusters", () => {
    // Requires truncate_bytes implementation
  });

  it.skip("truncates bytes preserves encoding", () => {
    // Requires truncate_bytes implementation
  });

  it("truncate words", () => {
    expect(truncateWords("Hello Big World!", 3)).toBe("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2)).toBe("Hello Big...");
  });

  it("truncate words with omission", () => {
    expect(truncateWords("Hello Big World!", 3, { omission: "[...]" })).toBe("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2, { omission: "[...]" })).toBe("Hello Big[...]");
  });

  it.skip("truncate words with separator", () => {
    // Requires separator option for truncateWords
  });

  it.skip("truncate words with separator and omission", () => {
    // Requires separator option for truncateWords
  });

  it.skip("truncate words with complex string", () => {
    // Requires handling of complex whitespace patterns
  });

  it.skip("truncate multibyte", () => {
    // Requires multibyte-aware truncation
  });

  it.skip("truncate should not be html safe", () => {
    // Requires html_safe integration
  });

  it.skip("remove", () => {
    // Requires remove() function
  });

  it.skip("remove for multiple occurrences", () => {
    // Requires remove() function
  });

  it.skip("remove!", () => {
    // Requires remove!() function
  });

  it.skip("constantize", () => {
    // Requires runtime constant resolution
  });

  it.skip("safe constantize", () => {
    // Requires runtime constant resolution
  });
});

describe("StringAccessTest", () => {
  it("#at with Integer, returns a substring of one character at that position", () => {
    expect(at("hello", 0)).toBe("h");
    expect(at("hello", 4)).toBe("o");
  });

  it.skip("#at with Range, returns a substring containing characters at offsets", () => {
    // Requires Range support for at()
  });

  it.skip("#at with Regex, returns the matching portion of the string", () => {
    // Requires Regex support for at()
  });

  it("#from with positive Integer, returns substring from the given position to the end", () => {
    expect(from("hello", 2)).toBe("llo");
  });

  it("#from with negative Integer, position is counted from the end", () => {
    expect(from("hello", -2)).toBe("lo");
  });

  it("#to with positive Integer, substring from the beginning to the given position", () => {
    expect(to("hello", 2)).toBe("hel");
  });

  it("#to with negative Integer, position is counted from the end", () => {
    expect(to("hello", -2)).toBe("hell");
    expect(to("hello", -5)).toBe("h");
    expect(to("hello", -7)).toBe("");
  });

  it("#from and #to can be combined", () => {
    expect(to(from("hello", 0), -1)).toBe("hello");
    expect(to(from("hello", 1), -2)).toBe("ell");
  });

  it("#first returns the first character", () => {
    expect(first("hello")).toBe("h");
    expect(first("x")).toBe("x");
  });

  it("#first with Integer, returns a substring from the beginning to position", () => {
    expect(first("hello", 2)).toBe("he");
    expect(first("hello", 0)).toBe("");
    expect(first("hello", 10)).toBe("hello");
    expect(first("x", 4)).toBe("x");
  });

  it.skip("#first with Integer >= string length still returns a new string", () => {
    // Not applicable to TypeScript (no object identity)
  });

  it.skip("#first with Integer returns a non-frozen string", () => {
    // Not applicable to TypeScript (no frozen strings)
  });

  it("#first with negative Integer raises ArgumentError", () => {
    expect(() => first("hello", -1)).toThrow();
  });

  it("#last returns the last character", () => {
    expect(last("hello")).toBe("o");
    expect(last("x")).toBe("x");
  });

  it("#last with Integer, returns a substring from the end to position", () => {
    expect(last("hello", 3)).toBe("llo");
    expect(last("hello", 10)).toBe("hello");
    expect(last("hello", 0)).toBe("");
    expect(last("x", 4)).toBe("x");
  });

  it.skip("#last with Integer >= string length still returns a new string", () => {
    // Not applicable to TypeScript (no object identity)
  });

  it.skip("#last with Integer returns a non-frozen string", () => {
    // Not applicable to TypeScript (no frozen strings)
  });

  it("#last with negative Integer raises ArgumentError", () => {
    expect(() => last("hello", -1)).toThrow();
  });

  it.skip("access returns a real string", () => {
    // Not applicable to TypeScript (no object identity concerns)
  });
});

describe("StringExcludeTest", () => {
  it.skip("inverse of #include", () => {
    // Requires exclude() function — JS has !str.includes() natively
  });
});

describe("StringIndentTest", () => {
  it("does not indent strings that only contain newlines (edge cases)", () => {
    expect(indent("\n", 8)).toBe("\n");
    expect(indent("\n\n", 8)).toBe("\n\n");
  });

  it("by default, indents with spaces if the existing indentation uses them", () => {
    expect(indent("foo\n  bar", 4)).toBe("    foo\n      bar");
  });

  it.skip("by default, indents with tabs if the existing indentation uses them", () => {
    // Requires auto-detect tab indentation
  });

  it("by default, indents with spaces as a fallback if there is no indentation", () => {
    expect(indent("foo\nbar\nbaz", 3)).toBe("   foo\n   bar\n   baz");
  });

  it("uses the indent char if passed", () => {
    expect(indent("foo\nbar", 4, ".")).toBe("....foo\n....bar");
  });

  it("does not indent blank lines by default", () => {
    expect(indent("foo\n\nbar", 1)).toBe(" foo\n\n bar");
  });

  it("indents blank lines if told so", () => {
    expect(indent("foo\n\nbar", 1, " ", true)).toBe(" foo\n \n bar");
  });
});
