import { describe, it, expect, vi, afterAll } from "vitest";
import type { BrowserType } from "playwright";
import { requirePlaywright } from "../../system-testing/driver.js";
import { vite } from "../../system-testing/server.js";

const foundExecutable = new URL(import.meta.url).pathname;
const { chromium, firefox } = (await requirePlaywright()) as {
  chromium: BrowserType;
  firefox: BrowserType;
};
vi.spyOn(chromium, "executablePath").mockImplementation(() => foundExecutable);
vi.spyOn(firefox, "executablePath").mockImplementation(() => foundExecutable);

const {
  DrivenByRackTest,
  DrivenBySeleniumWithChrome,
  DrivenBySeleniumWithHeadlessChrome,
  DrivenBySeleniumWithHeadlessFirefox,
} = await import("../../../test-helpers/driven-by.js");

afterAll(() => {
  vi.restoreAllMocks();
});

class SetDriverToRackTestTest extends DrivenByRackTest {}

class OverrideSeleniumSubclassToRackTestTest extends DrivenBySeleniumWithChrome {
  static {
    this.drivenBy("rack_test");
  }
}

class OverrideDriverWithExplicitName extends DrivenBySeleniumWithChrome {
  static {
    this.drivenBy("selenium", { options: { name: "best_driver" } });
  }
}

class SetDriverToSeleniumTest extends DrivenBySeleniumWithChrome {}

class SetDriverToSeleniumHeadlessChromeTest extends DrivenBySeleniumWithHeadlessChrome {}

class SetDriverToSeleniumHeadlessFirefoxTest extends DrivenBySeleniumWithHeadlessFirefox {}

describe("SetDriverToRackTestTest", () => {
  it("uses rack_test", () => {
    new SetDriverToRackTestTest("uses rack_test");
    expect(vite.currentDriver).toBe("rack_test");
  });
});

describe("OverrideSeleniumSubclassToRackTestTest", () => {
  it("uses rack_test", () => {
    new OverrideSeleniumSubclassToRackTestTest("uses rack_test");
    expect(vite.currentDriver).toBe("rack_test");
  });
});

describe("OverrideDriverWithExplicitName", () => {
  it("uses specified driver name", () => {
    new OverrideDriverWithExplicitName("uses specified driver name");
    expect(vite.currentDriver).toBe("best_driver");
  });
});

describe("SetDriverToSeleniumTest", () => {
  it("uses selenium", () => {
    new SetDriverToSeleniumTest("uses selenium");
    expect(vite.currentDriver).toBe("selenium");
  });
});

describe("SetDriverToSeleniumHeadlessChromeTest", () => {
  it("uses selenium headless chrome", () => {
    new SetDriverToSeleniumHeadlessChromeTest("uses selenium headless chrome");
    expect(vite.currentDriver).toBe("selenium");
  });
});

describe("SetDriverToSeleniumHeadlessFirefoxTest", () => {
  it("uses selenium headless firefox", () => {
    new SetDriverToSeleniumHeadlessFirefoxTest("uses selenium headless firefox");
    expect(vite.currentDriver).toBe("selenium");
  });
});
