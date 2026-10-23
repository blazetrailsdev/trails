import { describe, it, expect } from "vitest";
import {
  DrivenByRackTest,
  DrivenBySeleniumWithChrome,
  DrivenBySeleniumWithHeadlessChrome,
  DrivenBySeleniumWithHeadlessFirefox,
} from "../../../test-helpers/abstract-unit.js";
import { vite } from "../../system-testing/server.js";

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
