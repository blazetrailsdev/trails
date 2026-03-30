import { describe, it, expect } from "vitest";
import { at, from, to, first, last, indent, exclude } from "../string-utils.js";

import {
  htmlSafe,
  isHtmlSafe,
  htmlEscape,
  htmlEscapeOnce,
  xmlNameEscape,
} from "../core-ext/string/output-safety.js";
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
  truncateBytes,
  remove,
  ord,
  stripHeredoc,
  downcaseFirst,
  upcaseFirst,
} from "../index.js";
import { StringInquirer } from "../string-inquirer.js";

describe("StringAccessTest", () => {
  it("#at with Integer, returns a substring of one character at that position", () => {
    expect(at("hello", 0)).toBe("h");
    expect(at("hello", -1)).toBe("o");
    expect(at("hello", 10)).toBeUndefined();
  });
  it("#at with Range, returns a substring containing characters at offsets", () => {
    expect(at("hello", [1, 3])).toBe("ell");
    expect(at("hello", [0, -1])).toBe("hello");
  });
  it("#at with Regex, returns the matching portion of the string", () => {
    expect(at("hello world", /\w+/)).toBe("hello");
    expect(at("hello", /xyz/)).toBeUndefined();
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
  });
  it("#from and #to can be combined", () => {
    expect(to(from("hello", 1), 3)).toBe("ello");
  });
  it("#first returns the first character", () => {
    expect(first("hello")).toBe("h");
  });
  it("#first with Integer, returns a substring from the beginning to position", () => {
    expect(first("hello", 3)).toBe("hel");
  });
  it("#first with Integer >= string length still returns a new string", () => {
    expect(first("hello", 100)).toBe("hello");
  });
  it("#first with Integer returns a non-frozen string", () => {
    expect(typeof first("hello", 2)).toBe("string");
  });
  it("#first with negative Integer raises ArgumentError", () => {
    expect(() => first("hello", -1)).toThrow();
  });
  it("#last returns the last character", () => {
    expect(last("hello")).toBe("o");
  });
  it("#last with Integer, returns a substring from the end to position", () => {
    expect(last("hello", 3)).toBe("llo");
  });
  it("#last with Integer >= string length still returns a new string", () => {
    expect(last("hello", 100)).toBe("hello");
  });
  it("#last with Integer returns a non-frozen string", () => {
    expect(typeof last("hello", 2)).toBe("string");
  });
  it("#last with negative Integer raises ArgumentError", () => {
    expect(() => last("hello", -1)).toThrow();
  });
  it("access returns a real string", () => {
    expect(typeof at("hello", 0)).toBe("string");
  });
});

describe("StringConversionsTest", () => {
  it.skip("string to time");
  it.skip("timestamp string to time");
  it.skip("string to time utc offset");
  it.skip("partial string to time");
  it.skip("standard time string to time when current time is standard time");
  it.skip("standard time string to time when current time is daylight savings");
  it.skip("daylight savings string to time when current time is standard time");
  it.skip("daylight savings string to time when current time is daylight savings");
  it.skip("partial string to time when current time is standard time");
  it.skip("partial string to time when current time is daylight savings");
  it.skip("string to datetime");
  it.skip("partial string to datetime");
  it.skip("string to date");
});

describe("StringIndentTest", () => {
  it("does not indent strings that only contain newlines (edge cases)", () => {
    expect(indent("\n\n", 2)).toBe("\n\n");
  });
  it("by default, indents with spaces if the existing indentation uses them", () => {
    expect(indent("  foo\n  bar", 2)).toBe("    foo\n    bar");
  });
  it("by default, indents with tabs if the existing indentation uses them", () => {
    expect(indent("\tfoo", 1, "\t")).toBe("\t\tfoo");
  });
  it("by default, indents with spaces as a fallback if there is no indentation", () => {
    expect(indent("foo", 2)).toBe("  foo");
  });
  it("uses the indent char if passed", () => {
    expect(indent("foo", 2, "-")).toBe("--foo");
  });
  it("does not indent blank lines by default", () => {
    expect(indent("foo\n\nbar", 2)).toBe("  foo\n\n  bar");
  });
  it("indents blank lines if told so", () => {
    expect(indent("foo\n\nbar", 2, " ", true)).toBe("  foo\n  \n  bar");
  });
});

describe("CoreExtStringMultibyteTest", () => {
  it("core ext adds mb chars", () => {
    const str = "hello";
    expect([...str].length).toBe(5);
  });

  it("string should recognize utf8 strings", () => {
    const str = "こんにちは";
    expect(typeof str).toBe("string");
    expect([...str].length).toBe(5);
  });

  it("mb chars returns instance of proxy class", () => {
    const str = "hello";
    expect(typeof str).toBe("string");
  });
});

describe("StringBehaviorTest", () => {
  it("acts like string", () => {
    const s = htmlSafe("hello");
    expect(s.toString()).toBe("hello");
    expect(String(s)).toBe("hello");
    expect(s.length).toBe(5);
    expect(isHtmlSafe(s)).toBe(true);
  });
});

describe("StringExcludeTest", () => {
  it("inverse of #include", () => {
    expect(exclude("hello world" as any, "world" as any)).toBe(false);
    expect(exclude("hello world" as any, "xyz" as any)).toBe(true);
  });
});

describe("StringInflectionsTest", () => {
  it("strip heredoc on an empty string", () => {
    expect(stripHeredoc("")).toBe("");
  });

  it("strip heredoc on a frozen string", () => {
    const str = "  hello\n  world";
    const result = stripHeredoc(str);
    expect(result).toBe("hello\nworld");
    expect(str).toBe("  hello\n  world");
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

  it("pluralize with count = 1 still returns new string", () => {
    expect(pluralize("count", 1)).toBe("count");
    expect(pluralize("count")).toBe("counts");
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

  it("titleize with keep id suffix", () => {
    expect(titleize("artist_id", { keepIdSuffix: true })).toBe("Artist Id");
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

  it("camelize upper", () => {
    expect(camelize("active_record", "upper")).toBe("ActiveRecord");
  });

  it("camelize invalid option", () => {
    expect(() => camelize("foo", "invalid" as any)).toThrow("Invalid option");
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

  it("string parameterized no separator", () => {
    expect(parameterize("Donald E. Knuth", { separator: "" })).toBe("donaldeknuth");
  });

  it("string parameterized no separator preserve case", () => {
    expect(parameterize("Donald E. Knuth", { separator: "", preserveCase: true })).toBe(
      "DonaldEKnuth",
    );
  });

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

  it("string parameterized underscore preserve case", () => {
    expect(parameterize("Donald E. Knuth", { separator: "_", preserveCase: true })).toBe(
      "Donald_E_Knuth",
    );
  });

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

  it("humanize with keep id suffix", () => {
    expect(humanize("artist_id", { keepIdSuffix: true })).toBe("Artist id");
  });

  it("humanize with html escape", () => {
    expect(humanize("<b>foo</b>")).toBe("<b>foo</b>");
  });

  it("ord", () => {
    expect(ord("h")).toBe(104);
    expect(ord("a")).toBe(97);
  });

  it("starts ends with alias", () => {
    expect("hello".startsWith("hel")).toBe(true);
    expect("hello".endsWith("llo")).toBe(true);
  });

  it("string squish", () => {
    expect(squish("  foo   bar  \n  baz  ")).toBe("foo bar baz");
  });

  it("string inquiry", () => {
    const env = new StringInquirer("production") as any;
    expect(env.isProduction()).toBe(true);
    expect(env.isDevelopment()).toBe(false);
  });

  it("truncate", () => {
    expect(truncate("Hello World!", 12)).toBe("Hello World!");
    expect(truncate("Hello World!!", 12)).toBe("Hello Wor...");
  });

  it("truncate with omission and separator", () => {
    expect(
      truncate("Oh dear! Oh dear! I shall be late!", 18, { omission: "...", separator: " " }),
    ).toBe("Oh dear! Oh...");
  });

  it("truncate with omission and regexp separator", () => {
    expect(
      truncate("Oh dear! Oh dear! I shall be late!", 18, { omission: "...", separator: /\s/ }),
    ).toBe("Oh dear! Oh...");
  });

  it("truncate returns frozen string", () => {
    const result = truncate("Hello World!", 12);
    expect(typeof result).toBe("string");
  });

  it("truncate bytes", () => {
    expect(truncateBytes("👍👍👍👍", 16)).toBe("👍👍👍👍");
    expect(truncateBytes("👍👍👍👍", 15)).toBe("👍👍👍…");
  });

  it("truncate bytes preserves codepoints", () => {
    expect(truncateBytes("👍👍👍👍", 15, { omission: null })).toBe("👍👍👍");
    expect(truncateBytes("👍👍👍👍", 15, { omission: " " })).toBe("👍👍👍 ");
  });

  it("truncates bytes preserves grapheme clusters", () => {
    expect(truncateBytes("👍👍👍👍", 15, { omission: "🖖" })).toBe("👍👍🖖");
  });

  it("truncates bytes preserves encoding", () => {
    const result = truncateBytes("こんにちは", 12);
    expect(typeof result).toBe("string");
  });

  it("truncate words with omission", () => {
    expect(truncateWords("Hello Big World!", 3, { omission: "[...]" })).toBe("Hello Big World!");
    expect(truncateWords("Hello Big World!", 2, { omission: "[...]" })).toBe("Hello Big[...]");
  });

  it("truncate words with separator", () => {
    expect(truncateWords("Oh dear! Oh dear! I shall be late!", 4, { separator: "!" })).toBe(
      "Oh dear! Oh dear! I shall be late!",
    );
  });

  it("truncate words with separator and omission", () => {
    expect(
      truncateWords("Oh dear! Oh dear! I shall be late!", 4, { separator: "!", omission: "..." }),
    ).toBe("Oh dear! Oh dear! I shall be late!");
  });

  it("truncate words with complex string", () => {
    expect(truncateWords("Hello Big World", 2)).toBe("Hello Big...");
  });

  it("truncate multibyte", () => {
    expect(truncate("日本語のテスト文字列", 6)).toBe("日本語...");
  });

  it("truncate should not be html safe", () => {
    const result = truncate("Hello", 3);
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("remove", () => {
    expect(remove("Hello World", "Hello ")).toBe("World");
  });

  it("remove for multiple occurrences", () => {
    expect(remove("Hello World Hello", "Hello")).toBe(" World ");
  });

  it("remove!", () => {
    const str = "Hello World";
    const result = remove(str, "Hello ");
    expect(result).toBe("World");
  });

  it.skip("constantize");

  it.skip("safe constantize");
});

describe("OutputSafetyTest", () => {
  it("A string is unsafe by default", () => {
    expect(isHtmlSafe("hello")).toBe(false);
  });

  it("A string can be marked safe", () => {
    const safe = htmlSafe("hello");
    expect(isHtmlSafe(safe)).toBe(true);
  });

  it("Marking a string safe returns the string", () => {
    const safe = htmlSafe("hello");
    expect(safe.toString()).toBe("hello");
  });

  it("An integer is safe by default", () => {
    // In JS, numbers aren't strings, so isHtmlSafe is false for primitives
    expect(isHtmlSafe(42)).toBe(false);
  });

  it("a float is safe by default", () => {
    expect(isHtmlSafe(3.14)).toBe(false);
  });

  it("An object is unsafe by default", () => {
    expect(isHtmlSafe({})).toBe(false);
  });

  it("Adding an object not responding to `#to_str` to a safe string is deprecated", () => {
    const safe = htmlSafe("hello ");
    const result = safe.concat(42 as unknown as string);
    expect(result.toString()).toBe("hello 42");
  });

  it("Adding an object to a safe string returns a safe string", () => {
    const safe = htmlSafe("hello ");
    const result = safe.concat(htmlSafe("world"));
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Adding a safe string to another safe string returns a safe string", () => {
    const a = htmlSafe("hello ");
    const b = htmlSafe("world");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("hello world");
  });

  it("Adding an unsafe string to a safe string escapes it and returns a safe string", () => {
    const safe = htmlSafe("prefix: ");
    const result = safe.concat("<script>");
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).not.toContain("<script>");
    expect(result.toString()).toContain("&lt;script&gt;");
  });

  it("Prepending safe onto unsafe yields unsafe", () => {
    const safe = htmlSafe("world");
    const result = safe.toString() + "hello";
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("Prepending unsafe onto safe yields escaped safe", () => {
    const safe = htmlSafe("world");
    const escaped = htmlEscape("<unsafe>");
    const result = htmlSafe(escaped.toString() + safe.toString());
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toContain("&lt;unsafe&gt;");
    expect(result.toString()).toContain("world");
  });

  it("Concatting safe onto unsafe yields unsafe", () => {
    // A plain string concat'd with safe is still plain
    const unsafe = "hello ";
    const safe = htmlSafe("world");
    const result = unsafe + safe.toString();
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("Concatting unsafe onto safe yields escaped safe", () => {
    const safe = htmlSafe("safe ");
    const result = safe.concat("<unsafe>");
    expect(result.toString()).toContain("&lt;unsafe&gt;");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Concatting safe onto safe yields safe", () => {
    const a = htmlSafe("a");
    const b = htmlSafe("b");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("ab");
  });

  it("Concatting safe onto unsafe with << yields unsafe", () => {
    const unsafe = "hello ";
    const safe = htmlSafe("world");
    const result = unsafe + safe.toString();
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("Concatting unsafe onto safe with << yields escaped safe", () => {
    const safe = htmlSafe("safe ");
    const result = safe.concat("<unsafe>");
    expect(result.toString()).toContain("&lt;unsafe&gt;");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Concatting safe onto safe with << yields safe", () => {
    const a = htmlSafe("a");
    const b = htmlSafe("b");
    const result = a.concat(b);
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("ab");
  });

  it("Concatting safe onto unsafe with % yields unsafe", () => {
    const safe = htmlSafe("world");
    const result = `hello ${safe.toString()}`;
    expect(isHtmlSafe(result)).toBe(false);
  });

  it("% method explicitly cast the argument to string", () => {
    const safe = htmlSafe("hello %s");
    const result = safe.format([42]);
    expect(result.toString()).toBe("hello 42");
  });

  it("Concatting unsafe onto safe with % yields escaped safe", () => {
    const safe = htmlSafe("hello %s");
    const result = safe.format(["<b>world</b>"]);
    expect(result.toString()).toBe("hello &lt;b&gt;world&lt;/b&gt;");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Concatting safe onto safe with % yields safe", () => {
    const safe = htmlSafe("hello %s");
    const result = safe.format([htmlSafe("<b>world</b>")]);
    expect(result.toString()).toBe("hello <b>world</b>");
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Concatting with % doesn't modify a string", () => {
    const safe = htmlSafe("hello %s");
    const original = safe.toString();
    safe.format(["world"]);
    expect(safe.toString()).toBe(original);
  });

  it("Concatting an integer to safe always yields safe", () => {
    const safe = htmlSafe("count: ");
    const result = safe.concat(htmlSafe("42"));
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toBe("count: 42");
  });

  it("Inserting safe into safe yields safe", () => {
    const safe = htmlSafe("hello");
    const result = safe.concat(htmlSafe(" world"));
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Inserting unsafe into safe yields escaped safe", () => {
    const safe = htmlSafe("hello ");
    const result = safe.concat("<b>world</b>");
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).toContain("&lt;b&gt;");
  });

  it("Replacing safe with safe yields safe", () => {
    const safe = htmlSafe("hello world");
    const result = htmlSafe(safe.toString().replace("world", htmlSafe("universe").toString()));
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Replacing safe with unsafe yields escaped safe", () => {
    const safe = htmlSafe("hello world");
    const replacement = htmlEscape("<script>");
    const result = htmlSafe(safe.toString().replace("world", replacement.toString()));
    expect(isHtmlSafe(result)).toBe(true);
    expect(result.toString()).not.toContain("<script>");
  });

  it("Replacing index of safe with safe yields safe", () => {
    const safe = htmlSafe("012345");
    safe.set(0, htmlSafe("a").toString());
    expect(isHtmlSafe(safe)).toBe(true);
  });

  it("Replacing index of safe with unsafe yields escaped safe", () => {
    const safe = htmlSafe("012345");
    safe.set(0, "<");
    expect(safe.toString()).toContain("&lt;");
  });

  it("Bytesplicing safe into safe yields safe", () => {
    const safe = htmlSafe("hello world");
    const result = htmlSafe(
      safe.toString().slice(0, 6) + htmlSafe("universe").toString() + safe.toString().slice(11),
    );
    expect(isHtmlSafe(result)).toBe(true);
  });

  it("Bytesplicing unsafe into safe yields escaped safe", () => {
    const safe = htmlSafe("hello world");
    const escaped = htmlEscape("<b>");
    const result = htmlSafe(
      safe.toString().slice(0, 6) + escaped.toString() + safe.toString().slice(11),
    );
    expect(isHtmlSafe(result)).toBe(true);
  });

  it.skip("emits normal string YAML");

  it("call to_param returns a normal string", () => {
    const safe = htmlSafe("hello");
    expect(safe.toString()).toBe("hello");
    expect(typeof safe.toString()).toBe("string");
  });

  it("ERB::Util.html_escape should escape unsafe characters", () => {
    const result = htmlEscape('<script>alert("xss")</script>');
    expect(result.toString()).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("ERB::Util.html_escape should correctly handle invalid UTF-8 strings", () => {
    const result = htmlEscape("hello\uFFFDworld");
    expect(result.toString()).toContain("hello");
    expect(result.toString()).toContain("world");
  });

  it("ERB::Util.html_escape should not escape safe strings", () => {
    const safe = htmlSafe("<b>bold</b>");
    const result = htmlEscape(safe);
    expect(result.toString()).toBe("<b>bold</b>");
  });

  it("ERB::Util.html_escape_once only escapes once", () => {
    const result = htmlEscapeOnce("&lt;already escaped&gt;");
    expect(result.toString()).toBe("&lt;already escaped&gt;");
    const raw = htmlEscapeOnce("<raw>");
    expect(raw.toString()).toBe("&lt;raw&gt;");
  });

  it("ERB::Util.html_escape_once should correctly handle invalid UTF-8 strings", () => {
    const result = htmlEscapeOnce("hello\uFFFDworld");
    expect(result.toString()).toContain("hello");
    expect(result.toString()).toContain("world");
  });

  it("ERB::Util.html_escape_once preserves numeric character references", () => {
    expect(htmlEscapeOnce("&#123;").toString()).toBe("&#123;");
    expect(htmlEscapeOnce("&#x1F4A9;").toString()).toBe("&#x1F4A9;");
    expect(htmlEscapeOnce("&#X27;").toString()).toBe("&#X27;");
    expect(htmlEscapeOnce("&#x03BB;").toString()).toBe("&#x03BB;");
  });

  it("ERB::Util.html_escape_once escapes invalid entity-like sequences", () => {
    expect(htmlEscapeOnce("&1;").toString()).toBe("&amp;1;");
    expect(htmlEscapeOnce("&#1dfa3;").toString()).toBe("&amp;#1dfa3;");
    expect(htmlEscapeOnce("& #123;").toString()).toBe("&amp; #123;");
  });

  it("ERB::Util.xml_name_escape should escape unsafe characters for XML names", () => {
    const result = xmlNameEscape("hello world");
    expect(result).not.toContain(" ");
  });
});
