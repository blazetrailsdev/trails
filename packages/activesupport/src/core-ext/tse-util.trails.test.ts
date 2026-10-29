import { describe, it, expect } from "vitest";
import { htmlEscape } from "./tse/util.js";

describe("TSE::Util.html_escape", () => {
  it("keeps a byte-order mark", () => {
    expect(htmlEscape("a\u{feff}b").toString()).toBe("a\u{feff}b");
  });
});
