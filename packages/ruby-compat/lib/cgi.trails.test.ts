import { describe, expect, it } from "vitest";
import { CGI } from "./cgi.js";

describe("CGI", () => {
  it("escape leaves ~ and escapes *, then turns spaces into +, as cgi/util.rb:14 does", () => {
    expect(CGI.escape("John Doe-Smith/Jones~*")).toBe("John+Doe-Smith%2FJones~%2A");
    expect(CGI.escape("é")).toBe("%C3%A9");
  });

  it("unescape decodes + and %XX runs and leaves a malformed % alone", () => {
    expect(CGI.unescape("John+Doe-Smith%2FJones")).toBe("John Doe-Smith/Jones");
    expect(CGI.unescape("%C3%A9")).toBe("é");
    expect(CGI.unescape("100%zz")).toBe("100%zz");
  });
});
