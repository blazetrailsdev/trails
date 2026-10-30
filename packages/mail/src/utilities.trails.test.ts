import { describe, expect, it } from "vitest";
import { Utilities } from "./utilities.js";

describe("Utilities (trails)", () => {
  it("quotes a non-ASCII phrase, as /n reads every non-ASCII byte as control", () => {
    expect(Utilities.quotePhrase("café")).toBe('"café"');
    expect(Utilities.quoteToken("café")).toBe('"café"');
    expect(Utilities.quoteAtom("😀")).toBe('"😀"');
  });

  it("unquote follows Ruby line anchors on CRLF input", () => {
    expect(Utilities.unquote('"abc"\r\n')).toBe('"abc"\r\n');
    expect(Utilities.unquote('x\n"abc"\ny')).toBe("abc");
    expect(Utilities.unescape("a\\\rb")).toBe("a\rb");
  });

  it("blank? uses Ruby's ASCII whitespace for \\S", () => {
    expect(Utilities.isBlank("\u00a0")).toBe(false);
    expect(Utilities.isBlank(new Date())).toBe(false);
  });

  it("uri_escape matches URI::RFC2396_Parser for non-ASCII input", () => {
    expect(Utilities.uriEscape("café")).toBe("caf%C3%A9");
    expect(Utilities.uriUnescape("caf%C3%A9")).toBe("café");
  });
});
