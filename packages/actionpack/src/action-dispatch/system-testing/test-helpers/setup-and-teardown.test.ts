import { describe, it, expect, vi, afterEach } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { Dir, include } from "@blazetrails/ruby-compat";
import { vite } from "../server.js";
import { SetupAndTeardown, type SetupAndTeardownHost } from "./setup-and-teardown.js";

class TestCase {
  async beforeTeardown(): Promise<void> {}
  async afterTeardown(): Promise<void> {}
}
class SystemTestCase extends TestCase {}
include(SystemTestCase, SetupAndTeardown);

function build(attrs: SetupAndTeardownHost): SetupAndTeardownHost & SystemTestCase {
  return Object.assign(new SystemTestCase(), attrs);
}

describe("ActionDispatch::SystemTesting::TestHelpers::SetupAndTeardown", () => {
  const trails = TopLevel.Trails;

  afterEach(() => {
    TopLevel.Trails = trails;
    vi.restoreAllMocks();
    vite.currentDriver = "rack_test";
  });

  it("before_teardown calls take_failed_screenshot", async () => {
    TopLevel.Trails = { root: () => Dir.pwd() } as typeof TopLevel.Trails;
    vite.currentDriver = "selenium";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const host = build({
      methodName: "test",
      isPassed: () => false,
      isSkipped: () => false,
      _screenshotCounter: undefined,
      metadata: {},
      _page: {
        screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
        content: vi.fn().mockResolvedValue(""),
      },
    });
    await host.beforeTeardown();
    expect(host._screenshotCounter).toBe(1);
  });

  it("after_teardown closes the context and clears page", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const host = build({
      methodName: "test",
      isPassed: () => true,
      isSkipped: () => false,
      metadata: {},
      _context: { close },
      _page: { screenshot: vi.fn(), content: vi.fn() },
    });
    await host.afterTeardown();
    expect(close).toHaveBeenCalled();
    expect(host._context).toBeUndefined();
    expect(host._page).toBeUndefined();
  });
});
