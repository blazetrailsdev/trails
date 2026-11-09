import { describe, it, expect } from "vitest";
import { htmlEscape } from "@blazetrails/activesupport";

describe("TseUtilTest", () => {
  it("html escape amp", () => {
    expect(htmlEscape("&").toString()).toBe("&amp;");
  });

  it("html escape lt", () => {
    expect(htmlEscape("<").toString()).toBe("&lt;");
  });

  it("html escape gt", () => {
    expect(htmlEscape(">").toString()).toBe("&gt;");
  });

  it("html escape quot", () => {
    expect(htmlEscape('"').toString()).toBe("&quot;");
  });

  it("html escape 39", () => {
    expect(htmlEscape("'").toString()).toBe("&#39;");
  });
});
