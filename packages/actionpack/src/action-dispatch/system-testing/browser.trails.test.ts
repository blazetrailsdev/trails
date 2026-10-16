import { beforeEach, describe, expect, it, vi } from "vitest";
import { Gem } from "@blazetrails/ruby-compat";
import { Browser, serviceDriverPath } from "./browser.js";
import { requirePlaywright } from "./driver.js";

const installed = import.meta.url.replace(/^file:\/\//, "");
const paths = vi.hoisted(() => ({ chromium: "", firefox: "" }));

vi.mock("playwright", () => ({
  chromium: { executablePath: () => paths.chromium },
  firefox: { executablePath: () => paths.firefox },
}));

describe("Browser", () => {
  beforeEach(() => {
    serviceDriverPath.clear();
  });

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

  it("adds --disable-gpu to chrome options on Windows", () => {
    const spy = vi.spyOn(Gem, "isWinPlatform").mockReturnValue(true);
    try {
      expect(new Browser("chrome").options?.args).toContain("--disable-gpu");
    } finally {
      spy.mockRestore();
    }
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

  it("preload seats the installed executable path", async () => {
    paths.chromium = installed;
    paths.firefox = installed;
    const chrome = new Browser("headless_chrome");
    await chrome.preload();
    const playwright = await requirePlaywright();
    expect(serviceDriverPath.get(playwright.chromium as never)).toBe(installed);
    const firefox = new Browser("firefox");
    await firefox.preload();
    expect(serviceDriverPath.get(playwright.firefox as never)).toBe(installed);
  });

  it("preload raises when the browser is not installed", async () => {
    paths.chromium = "/nonexistent/chrome";
    await expect(new Browser("chrome").preload()).rejects.toThrow(
      "Executable doesn't exist at /nonexistent/chrome",
    );
  });

  it("preload does nothing for another browser", async () => {
    const browser = new Browser("safari");
    await browser.preload();
    expect(browser.options).toBeUndefined();
  });
});
