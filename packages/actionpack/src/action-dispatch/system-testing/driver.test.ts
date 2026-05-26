import { describe, it, expect } from "vitest";
import { Driver } from "./driver.js";

describe("ActionDispatch::SystemTesting::Driver", () => {
  it("initializes with default options", () => {
    const driver = new Driver("playwright");
    expect(driver.name).toBe("playwright");
  });

  it("extracts and deletes name from options", () => {
    const driver = new Driver("playwright", { options: { name: "custom" } });
    expect(driver.name).toBe("custom");
  });

  it("non-registerable driver is a no-op", async () => {
    const driver = new Driver("unsupported");
    await driver.use();
  });

  it("throws when newContext called before use", async () => {
    const driver = new Driver("playwright");
    await expect(driver.newContext()).rejects.toThrow("Driver not started");
  });
});
