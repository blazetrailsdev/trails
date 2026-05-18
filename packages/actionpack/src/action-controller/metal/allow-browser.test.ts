import { describe, it, expect } from "vitest";
import { BrowserBlocker } from "./allow-browser.js";

const CHROME_118 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36";
const CHROME_120 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const IE_11 = "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko";
const GOOGLE_BOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("BrowserBlocker", () => {
  describe("expandedVersions", () => {
    it("resolves the :modern named set", () => {
      const b = new BrowserBlocker(CHROME_120, "modern");
      expect(b.expandedVersions()).toEqual({
        safari: "17.2",
        chrome: "120",
        firefox: "121",
        opera: "106",
        ie: false,
      });
    });

    it("returns an empty map for an unknown named set", () => {
      const b = new BrowserBlocker(CHROME_120, "unknown" as "modern");
      expect(b.expandedVersions()).toEqual({});
    });

    it("returns a hash directly when given one", () => {
      const b = new BrowserBlocker(CHROME_120, { chrome: "119" });
      expect(b.expandedVersions()).toEqual({ chrome: "119" });
    });

    it("memoizes the result", () => {
      const b = new BrowserBlocker(CHROME_120, "modern");
      expect(b.expandedVersions()).toBe(b.expandedVersions());
    });
  });

  describe("normalizedBrowserName", () => {
    it("normalizes 'internet explorer' to 'ie'", () => {
      const b = new BrowserBlocker(IE_11, {});
      expect(b.normalizedBrowserName()).toBe("ie");
    });

    it("lowercases the browser name", () => {
      const b = new BrowserBlocker(CHROME_120, {});
      expect(b.normalizedBrowserName()).toBe("chrome");
    });
  });

  describe("isBot", () => {
    it("returns true for a Googlebot user agent", () => {
      const b = new BrowserBlocker(GOOGLE_BOT, "modern");
      expect(b.isBot()).toBe(true);
    });

    it("returns false for a regular browser", () => {
      const b = new BrowserBlocker(CHROME_120, "modern");
      expect(b.isBot()).toBe(false);
    });
  });

  describe("isUserAgentVersionReported", () => {
    it("returns false when the user-agent header is empty", () => {
      const b = new BrowserBlocker("", "modern");
      expect(b.isUserAgentVersionReported()).toBe(false);
    });

    it("returns true when the parsed version is present", () => {
      const b = new BrowserBlocker(CHROME_120, "modern");
      expect(b.isUserAgentVersionReported()).toBe(true);
    });
  });

  describe("minimumBrowserVersionForBrowser", () => {
    it("looks up by normalized browser name", () => {
      const b = new BrowserBlocker(CHROME_120, { chrome: "119" });
      expect(b.minimumBrowserVersionForBrowser()).toBe("119");
    });

    it("returns false when the browser is explicitly disallowed", () => {
      const b = new BrowserBlocker(IE_11, { ie: false });
      expect(b.minimumBrowserVersionForBrowser()).toBe(false);
    });

    it("returns undefined when the browser is not listed", () => {
      const b = new BrowserBlocker(CHROME_120, { firefox: "120" });
      expect(b.minimumBrowserVersionForBrowser()).toBeUndefined();
    });
  });

  describe("isVersionGuardedBrowser", () => {
    it("is true when an entry exists (including false)", () => {
      expect(new BrowserBlocker(IE_11, { ie: false }).isVersionGuardedBrowser()).toBe(true);
      expect(new BrowserBlocker(CHROME_120, { chrome: "119" }).isVersionGuardedBrowser()).toBe(
        true,
      );
    });

    it("is false when the browser is not listed", () => {
      expect(new BrowserBlocker(CHROME_120, { firefox: "120" }).isVersionGuardedBrowser()).toBe(
        false,
      );
    });
  });

  describe("isVersionBelowMinimumRequired", () => {
    it("is true when the parsed version is below the minimum", () => {
      const b = new BrowserBlocker(CHROME_118, { chrome: "119" });
      expect(b.isVersionBelowMinimumRequired()).toBe(true);
    });

    it("is false when the parsed version meets the minimum", () => {
      const b = new BrowserBlocker(CHROME_120, { chrome: "119" });
      expect(b.isVersionBelowMinimumRequired()).toBe(false);
    });

    it("is true when the minimum is false (browser disallowed)", () => {
      const b = new BrowserBlocker(IE_11, { ie: false });
      expect(b.isVersionBelowMinimumRequired()).toBe(true);
    });
  });

  describe("isUnsupportedBrowser", () => {
    it("blocks an old guarded browser that isn't a bot", () => {
      const b = new BrowserBlocker(CHROME_118, "modern");
      expect(b.isUnsupportedBrowser()).toBe(true);
    });

    it("does not block a bot even when guarded and below minimum", () => {
      const b = new BrowserBlocker(GOOGLE_BOT, "modern");
      expect(b.isUnsupportedBrowser()).toBe(false);
    });

    it("does not block an unguarded browser", () => {
      const b = new BrowserBlocker(CHROME_120, { firefox: "200" });
      expect(b.isUnsupportedBrowser()).toBe(false);
    });
  });

  describe("blocked", () => {
    it("is true when version is reported and the browser is unsupported", () => {
      expect(new BrowserBlocker(CHROME_118, "modern").blocked).toBe(true);
    });

    it("is false when no user-agent is sent", () => {
      expect(new BrowserBlocker("", "modern").blocked).toBe(false);
    });

    it("is false when the browser meets the minimum", () => {
      expect(new BrowserBlocker(CHROME_120, "modern").blocked).toBe(false);
    });
  });
});
