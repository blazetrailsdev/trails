import { describe, it, expect, vi, afterEach } from "vitest";
import { vite } from "../server.js";
import { beforeTeardown, afterTeardown, type SetupAndTeardownHost } from "./setup-and-teardown.js";

describe("ActionDispatch::SystemTesting::TestHelpers::SetupAndTeardown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vite.currentDriver = "rack_test";
  });

  it("before_teardown calls take_failed_screenshot", async () => {
    vite.currentDriver = "selenium";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const host: SetupAndTeardownHost = {
      methodName: "test",
      isPassed: () => false,
      isSkipped: () => false,
      _screenshotCounter: undefined,
      metadata: {},
      _page: {
        screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
        content: vi.fn().mockResolvedValue(""),
      },
    };
    await beforeTeardown.call(host);
    expect(host._screenshotCounter).toBe(1);
  });

  it("after_teardown closes the context and clears page", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const host: SetupAndTeardownHost = {
      methodName: "test",
      isPassed: () => true,
      isSkipped: () => false,
      metadata: {},
      _context: { close },
      _page: { screenshot: vi.fn(), content: vi.fn() },
    };
    await afterTeardown.call(host);
    expect(close).toHaveBeenCalled();
    expect(host._context).toBeUndefined();
    expect(host._page).toBeUndefined();
  });
});
