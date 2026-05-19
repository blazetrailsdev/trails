import { describe, expect, it } from "vitest";
import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { pluralize, simpleFormat, truncate, wordWrap } from "./text-helper.js";

describe("truncate", () => {
  it("truncates with default length 30 and ellipsis", () => {
    expect(truncate("Once upon a time in a world far far away")?.toString()).toBe(
      "Once upon a time in a world...",
    );
  });

  it("respects custom length", () => {
    expect(truncate("Once upon a time in a world far far away", { length: 17 })?.toString()).toBe(
      "Once upon a ti...",
    );
  });

  it("uses separator to break at word boundary", () => {
    expect(
      truncate("Once upon a time in a world far far away", {
        length: 17,
        separator: " ",
      })?.toString(),
    ).toBe("Once upon a...");
  });

  it("uses custom omission", () => {
    expect(
      truncate("And they found that many people were sleeping better.", {
        length: 25,
        omission: "... (continued)",
      })?.toString(),
    ).toBe("And they f... (continued)");
  });

  it("escapes HTML by default and marks safe", () => {
    const out = truncate("<p>Once upon a time in a world far far away</p>");
    expect(out).toBeInstanceOf(SafeBuffer);
    expect(out?.htmlSafe).toBe(true);
    expect(out?.toString()).toBe("&lt;p&gt;Once upon a time in a wo...");
  });

  it("skips escape when escape: false", () => {
    expect(
      truncate("<p>Once upon a time in a world far far away</p>", {
        escape: false,
      })?.toString(),
    ).toBe("<p>Once upon a time in a wo...");
  });

  it("appends block content when truncated", () => {
    const out = truncate("Once upon a time in a world far far away", {}, () =>
      htmlSafe('<a href="#">Continue</a>'),
    );
    expect(out?.toString()).toBe('Once upon a time in a world...<a href="#">Continue</a>');
  });

  it("does not append block content when not truncated", () => {
    expect(truncate("short", {}, () => "EXTRA")?.toString()).toBe("short");
  });

  it("returns undefined for null/undefined text", () => {
    expect(truncate(null)).toBeUndefined();
    expect(truncate(undefined)).toBeUndefined();
  });
});

describe("pluralize", () => {
  it("returns singular for count 1", () => {
    expect(pluralize(1, "person")).toBe("1 person");
  });

  it("returns plural for count != 1", () => {
    expect(pluralize(2, "person")).toBe("2 people");
    expect(pluralize(0, "person")).toBe("0 people");
  });

  it("uses explicit plural positional arg", () => {
    expect(pluralize(3, "person", "users")).toBe("3 users");
  });

  it("uses explicit plural via options", () => {
    expect(pluralize(3, "person", { plural: "users" })).toBe("3 users");
  });

  it("treats 1.0 as singular", () => {
    expect(pluralize("1.0", "person")).toBe("1.0 person");
  });

  it("treats null count as 0", () => {
    expect(pluralize(null, "person")).toBe("0 people");
  });
});

describe("wordWrap", () => {
  it("returns short text unchanged", () => {
    expect(wordWrap("Once upon a time")).toBe("Once upon a time");
  });

  it("wraps at default 80 chars", () => {
    const text =
      "Once upon a time, in a kingdom called Far Far Away, a king fell ill, and finding a successor to the throne turned out to be more trouble than anyone could have imagined...";
    expect(wordWrap(text)).toBe(
      "Once upon a time, in a kingdom called Far Far Away, a king fell ill, and finding\na successor to the throne turned out to be more trouble than anyone could have\nimagined...",
    );
  });

  it("respects lineWidth", () => {
    expect(wordWrap("Once upon a time", { lineWidth: 8 })).toBe("Once\nupon a\ntime");
    expect(wordWrap("Once upon a time", { lineWidth: 1 })).toBe("Once\nupon\na\ntime");
  });

  it("uses custom breakSequence", () => {
    expect(wordWrap("Once upon a time", { lineWidth: 1, breakSequence: "\r\n" })).toBe(
      "Once\r\nupon\r\na\r\ntime",
    );
  });

  it("returns empty for empty input", () => {
    expect(wordWrap("")).toBe("");
  });
});

describe("simpleFormat", () => {
  it("wraps text in <p> with <br /> for single newlines", () => {
    expect(simpleFormat("Here is some basic text...\n...with a line break.").toString()).toBe(
      "<p>Here is some basic text...\n<br />...with a line break.</p>",
    );
  });

  it("splits double newlines into separate paragraphs", () => {
    expect(simpleFormat("We want to put a paragraph...\n\n...right there.").toString()).toBe(
      "<p>We want to put a paragraph...</p>\n\n<p>...right there.</p>",
    );
  });

  it("supports html_options like class", () => {
    expect(simpleFormat("Look ma! A class!", { class: "description" }).toString()).toBe(
      '<p class="description">Look ma! A class!</p>',
    );
  });

  it("supports custom wrapperTag", () => {
    expect(
      simpleFormat(
        "Here is some basic text...\n...with a line break.",
        {},
        { wrapperTag: "div" },
      ).toString(),
    ).toBe("<div>Here is some basic text...\n<br />...with a line break.</div>");
  });

  it("sanitizes by default", () => {
    expect(simpleFormat("<blink>Unblinkable.</blink>").toString()).toBe("<p>Unblinkable.</p>");
  });

  it("skips sanitize when sanitize: false", () => {
    expect(simpleFormat("<custom>X</custom>", {}, { sanitize: false }).toString()).toBe(
      "<p><custom>X</custom></p>",
    );
  });

  it("returns empty wrapper when text is blank", () => {
    expect(simpleFormat("").toString()).toBe("<p></p>");
  });

  it("marks result html_safe", () => {
    expect(simpleFormat("hi").htmlSafe).toBe(true);
  });
});
