import { afterEach, describe, it, expect, vi } from "vitest";
import { SystemTestCase, DEFAULT_HOST } from "./system-test-case.js";
import { Driver } from "./system-testing/driver.js";

describe("ActionDispatch::SystemTestCase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    SystemTestCase.driver = undefined;
  });

  it("has DEFAULT_HOST constant", () => {
    expect(DEFAULT_HOST).toBe("http://127.0.0.1");
  });

  it("drivenBy configures a driver", () => {
    SystemTestCase.drivenBy("playwright", { using: "chromium" });
    expect(SystemTestCase.driver).toBeDefined();
    expect(SystemTestCase.driver!.name).toBe("playwright");
  });

  it("servedBy accepts host and port", () => {
    expect(() => SystemTestCase.servedBy({ host: "localhost", port: 3000 })).not.toThrow();
  });

  it("constructor defaults driver to playwright and calls use", () => {
    const useSpy = vi.spyOn(Driver.prototype, "use").mockResolvedValue(undefined);
    new SystemTestCase();
    expect(SystemTestCase.driver).toBeDefined();
    expect(SystemTestCase.driver!.name).toBe("playwright");
    expect(useSpy).toHaveBeenCalled();
  });
});
