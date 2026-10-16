import { describe, expect, it } from "vitest";
import { Browser } from "./browser.js";

describe("Browser", () => {
  it("maps headless names to their browser type", () => {
    expect(new Browser("headless_chrome").type).toBe("chrome");
    expect(new Browser("headless_firefox").type).toBe("firefox");
    expect(new Browser("safari").type).toBe("safari");
  });

  it("builds chrome launch options", () => {
    expect(new Browser("chrome").options?.args).toContain("--disable-search-engine-choice-screen");
    expect(new Browser("chrome").options?.headless).toBe(false);
    const headless = new Browser("headless_chrome").options!;
    expect(headless.args).toContain("--headless");
    expect(headless.headless).toBe(true);
    expect(headless.channel).toBeUndefined();
  });

  it("builds firefox launch options", () => {
    expect(new Browser("firefox").options).toEqual({ args: [], headless: false });
    expect(new Browser("headless_firefox").options).toEqual({
      args: ["-headless"],
      headless: true,
    });
  });

  it("has no options for another browser", () => {
    expect(new Browser("safari").options).toBeUndefined();
  });

  it("configure yields options", () => {
    const browser = new Browser("chrome");
    browser.configure((options) => {
      options!.channel = "chrome";
    });
    expect(browser.options?.channel).toBe("chrome");
  });
});
