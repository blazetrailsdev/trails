import { describe, it, expect } from "vitest";
import { Session } from "@blazetrails/rack-test";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { Driver } from "./driver.js";
import { vite } from "./server.js";

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
});
