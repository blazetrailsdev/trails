import { describe, it, expect, vi, afterEach } from "vitest";
import { beforeTeardown, afterTeardown, type SetupAndTeardownHost } from "./setup-and-teardown.js";

describe("ActionDispatch::SystemTesting::TestHelpers::SetupAndTeardown", () => {
  afterEach(() => vi.restoreAllMocks());

  it("before_teardown calls take_failed_screenshot", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const host: SetupAndTeardownHost = {
      _testFailed: true,
      _screenshotCounter: undefined,
      _testName: "test",
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
      _context: { close },
      _page: { screenshot: vi.fn(), content: vi.fn() },
    };
    await afterTeardown.call(host);
    expect(close).toHaveBeenCalled();
    expect(host._context).toBeUndefined();
    expect(host._page).toBeUndefined();
  });
});
