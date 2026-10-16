import { afterEach, describe, it, expect, vi } from "vitest";
import { SystemTestCase, DEFAULT_HOST } from "./system-test-case.js";
import { Driver } from "./system-testing/driver.js";
import { vite } from "./system-testing/server.js";

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
    const { host, port } = vite.config.server;
    SystemTestCase.servedBy({ host: "localhost", port: 3000 });
    try {
      expect(vite.config.server.host).toBe("localhost");
      expect(vite.config.server.port).toBe(3000);
    } finally {
      vite.config.server.host = host;
      vite.config.server.port = port;
    }
  });

  it("constructor defaults driver to playwright and calls use", () => {
    const useSpy = vi.spyOn(Driver.prototype, "use").mockReturnValue(undefined);
    new SystemTestCase();
    expect(SystemTestCase.driver).toBeDefined();
    expect(SystemTestCase.driver!.name).toBe("playwright");
    expect(useSpy).toHaveBeenCalled();
  });
});
