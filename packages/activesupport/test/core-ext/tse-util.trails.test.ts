import { describe, it, expect } from "vitest";
import { htmlEscape, htmlEscapeOnce } from "../../lib/core-ext/tse/util.js";

describe("TSE::Util.html_escape", () => {
  it("keeps a byte-order mark", () => {
    expect(htmlEscape("a\u{feff}b").toString()).toBe("a\u{feff}b");
    expect(htmlEscape("\u{feff}ab").toString()).toBe("\u{feff}ab");
  });

  it("escapes an ASCII-8BIT string read one character per byte", () => {
    const bytes = Uint8Array.of(0x3c, 0x62, 0x3e, 0xff, 0x26);
    expect(htmlEscape(bytes).toString()).toBe("&lt;b&gt;\xff&amp;");
    expect(htmlEscapeOnce(bytes).toString()).toBe("&lt;b&gt;\xff&amp;");
  });
});
