import { describe, it, expect } from "vitest";
import { htmlEscape } from "./tse/util.js";

describe("TSE::Util.html_escape", () => {
  // `ERB::Util.html_escape("a\u{feff}b")` is `"a\u{feff}b"`: the escape goes
  // through `Unicode.tidyBytes` → `scrub`, which must keep a byte-order mark.
  it("keeps a byte-order mark", () => {
    expect(htmlEscape("a\u{feff}b").toString()).toBe("a\u{feff}b");
  });
});
