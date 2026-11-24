import { describe, it, expect } from "vitest";
import { Utils } from "../../../../lib/action-dispatch/journey/router/utils.js";

describe("Router", () => {
  describe("TestUtils", () => {
    it("path escape", () => {
      expect(Utils.escapePath("a/b c+d%")).toBe("a/b%20c+d%25");
    });

    it("segment escape", () => {
      expect(Utils.escapeSegment("a/b c+d%")).toBe("a%2Fb%20c+d%25");
    });

    it("fragment escape", () => {
      expect(Utils.escapeFragment("a/b c+d%?e")).toBe("a/b%20c+d%25?e");
    });

    it("uri unescape", () => {
      expect(Utils.unescapeUri("a%2Fb%20c+d")).toBe("a/b c+d");
    });

    it("uri unescape with utf8 string", () => {
      expect(Utils.unescapeUri("%C5%A0a%C5%A1inkov%C3%A1")).toBe("Šašinková");
    });

    it("normalize path not greedy", () => {
      expect(Utils.normalizePath("/foo%20bar%20baz")).toBe("/foo%20bar%20baz");
    });

    it("normalize path uppercase", () => {
      expect(Utils.normalizePath("/foo%aabar%aabaz")).toBe("/foo%AAbar%AAbaz");
    });

    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the test asserts `normalize_path(path).encoding` keeps ASCII-8BIT.
    it.skip("normalize path maintains string encoding", () => {});

    it("normalize path with nil", () => {
      expect(Utils.normalizePath(null)).toBe("/");
    });
  });
});
