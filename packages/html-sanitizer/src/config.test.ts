// Parity test: pin DEFAULT_ALLOWED_TAGS / ATTRIBUTES against the upstream
// rails-html-sanitizer Ruby source. If Rails adds or removes an entry,
// this test fails and we must update config.ts deliberately.

import { describe, expect, test } from "vitest";
import { DEFAULT_ALLOWED_ATTRIBUTES, DEFAULT_ALLOWED_TAGS } from "./config.js";

describe("default allowlists", () => {
  test("DEFAULT_ALLOWED_TAGS matches rails-html-sanitizer SafeList::DEFAULT_ALLOWED_TAGS", () => {
    expect([...DEFAULT_ALLOWED_TAGS].sort()).toEqual(
      [
        "a",
        "abbr",
        "acronym",
        "address",
        "b",
        "big",
        "blockquote",
        "br",
        "cite",
        "code",
        "dd",
        "del",
        "dfn",
        "div",
        "dl",
        "dt",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "ins",
        "kbd",
        "li",
        "mark",
        "ol",
        "p",
        "pre",
        "samp",
        "small",
        "span",
        "strong",
        "sub",
        "sup",
        "time",
        "tt",
        "ul",
        "var",
      ].sort(),
    );
  });

  test("DEFAULT_ALLOWED_ATTRIBUTES matches rails-html-sanitizer SafeList::DEFAULT_ALLOWED_ATTRIBUTES", () => {
    expect([...DEFAULT_ALLOWED_ATTRIBUTES].sort()).toEqual(
      [
        "abbr",
        "alt",
        "cite",
        "class",
        "datetime",
        "height",
        "href",
        "lang",
        "name",
        "src",
        "title",
        "width",
        "xml:lang",
      ].sort(),
    );
  });
});
