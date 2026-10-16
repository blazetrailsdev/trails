import { describe, it, expect, vi } from "vitest";
import type { BrowserType } from "playwright";
import { Session } from "@blazetrails/rack-test";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { serviceDriverPath } from "../../system-testing/browser.js";
import { Driver, requirePlaywright } from "../../system-testing/driver.js";
import { vite } from "../../system-testing/server.js";

describe("ActionDispatch::SystemTesting::Driver", () => {
  it("initializes with default options", () => {
    const driver = new Driver("playwright");
    expect(driver.name).toBe("playwright");
  });

  it("extracts and deletes name from options", () => {
    const driver = new Driver("playwright", { options: { name: "custom" } });
    expect(driver.name).toBe("custom");
  });

  it("non-registerable driver only sets the current driver", () => {
    const driver = new Driver("unsupported");
    driver.use();
    expect(vite.drivers.unsupported).toBeUndefined();
    expect(vite.currentDriver).toBe("unsupported");
  });

  it("registers a driver factory under its name", () => {
    const driver = new Driver("rack_test", { options: { name: "rt" } });
    driver.use();
    expect(vite.drivers.rt).toBeTypeOf("function");
    expect(vite.currentDriver).toBe("rt");
  });

  it("rack_test factory builds a rack-test session against the app", async () => {
    const driver = new Driver("rack_test");
    driver.use();
    const app = async () => [200, {}, ["ok"]] as [number, Record<string, string>, string[]];
    expect(await vite.drivers.rack_test(app as never)).toBeInstanceOf(Session);
  });

  it("selenium arm raises NotImplementedError", async () => {
    const driver = new Driver("selenium", { using: "chrome", options: { browser: "remote" } });
    driver.use();
    await expect(vite.drivers.selenium(undefined)).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("a selenium preload that cannot resolve a driver rejects when the driver is used", async () => {
    const { chromium } = (await requirePlaywright()) as { chromium: BrowserType };
    const originalDriverPath = serviceDriverPath.get(chromium);
    serviceDriverPath.delete(chromium);
    const spy = vi.spyOn(chromium, "executablePath").mockReturnValue("/nonexistent/chromedriver");
    try {
      const driver = new Driver("selenium", { using: "chrome", options: { name: "missing" } });
      driver.use();
      await expect(vite.drivers.missing(undefined)).rejects.toThrow(
        "Executable doesn't exist at /nonexistent/chromedriver",
      );
    } finally {
      spy.mockRestore();
      if (originalDriverPath !== undefined) serviceDriverPath.set(chromium, originalDriverPath);
    }
  });
});
