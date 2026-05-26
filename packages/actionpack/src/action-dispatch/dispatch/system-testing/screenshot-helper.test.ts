import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  takeScreenshot,
  takeFailedScreenshot,
  imageName,
  imagePath,
  htmlPath,
  screenshotsDir,
  outputType,
  displayImage,
  incrementUnique,
  inlineBase64,
  supportsScreenshot,
  type ScreenshotHelperHost,
} from "../../system-testing/test-helpers/screenshot-helper.js";

function makeHost(testName: string): ScreenshotHelperHost & { metadata: Record<string, unknown> } {
  return { _testName: testName, _screenshotCounter: undefined, _testFailed: false, metadata: {} };
}

describe("ActionDispatch::SystemTesting::TestHelpers::ScreenshotHelper", () => {
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    host = makeHost("x");
    vi.stubEnv("RAILS_SYSTEM_TESTING_SCREENSHOT", "");
    vi.stubEnv("TRAILS_SYSTEM_TESTING_SCREENSHOT", "");
    vi.stubEnv("RAILS_SYSTEM_TESTING_SCREENSHOT_HTML", "");
    vi.stubEnv("TRAILS_SYSTEM_TESTING_SCREENSHOT_HTML", "");
    vi.stubEnv("CAPYBARA_SAVE_PATH", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("image path is saved in tmp directory", () => {
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/0_x\.png$/);
  });

  it("image path unique counter is changed when incremented", () => {
    incrementUnique.call(host);
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/1_x\.png$/);
  });

  it("image path unique counter generates different path in same test", () => {
    incrementUnique.call(host);
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/1_x\.png$/);
    incrementUnique.call(host);
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/2_x\.png$/);
  });

  it("image path uses the Capybara.save_path to set a custom directory", () => {
    vi.stubEnv("CAPYBARA_SAVE_PATH", "custom_dir");
    expect(imagePath.call(host)).toMatch(/custom_dir\/0_x\.png$/);
  });

  it("image path includes failures text if test did not pass", () => {
    host._testFailed = true;
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/failures_x\.png$/);
    expect(htmlPath.call(host)).toMatch(/tmp\/screenshots\/failures_x\.html$/);
  });

  it("image path does not include failures text if test skipped", () => {
    // skipped = not failed; _testFailed stays false
    expect(imagePath.call(host)).toMatch(/tmp\/screenshots\/0_x\.png$/);
    expect(htmlPath.call(host)).toMatch(/tmp\/screenshots\/0_x\.html$/);
  });

  it("image name truncates names over 225 characters including counter", () => {
    const longHost = makeHost("x".repeat(400));
    const name = imageName.call(longHost);
    expect(name.length).toBeLessThanOrEqual(225);
    expect(name).toMatch(/^0_x+$/);
  });

  it("defaults to simple output for the screenshot", () => {
    expect(outputType()).toBe("simple");
  });

  it("Non word characters are replaced with dashes in paths", () => {
    const h = makeHost("x/y\\z?<br>-span");
    expect(imagePath.call(h)).toMatch(/tmp\/screenshots\/0_x-y-z-br-span\.png$/);
    expect(htmlPath.call(h)).toMatch(/tmp\/screenshots\/0_x-y-z-br-span\.html$/);
  });

  it("take_screenshot allows changing screenshot display format via screenshot: kwarg", () => {
    const msgs: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((m: string) => msgs.push(m));
    const page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };
    host._page = page;
    return takeScreenshot.call(host, { screenshot: "artifact" }).then(() => {
      const out = msgs.join("\n");
      expect(out).toMatch(/url=artifact:\/\//);
      consoleSpy.mockRestore();
    });
  });

  it("take_screenshot saves HTML and shows link to it when using html: kwarg", () => {
    const msgs: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((m: string) => msgs.push(m));
    const page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };
    host._page = page;
    return takeScreenshot.call(host, { html: true }).then(() => {
      const out = msgs.join("\n");
      expect(out).toMatch(/\[Screenshot HTML\]/);
      expect(page.content).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  it("take_screenshot saves HTML and shows link to it when using RAILS_SYSTEM_TESTING_SCREENSHOT_HTML env", () => {
    vi.stubEnv("RAILS_SYSTEM_TESTING_SCREENSHOT_HTML", "1");
    const msgs: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((m: string) => msgs.push(m));
    const page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };
    host._page = page;
    return takeScreenshot.call(host).then(() => {
      const out = msgs.join("\n");
      expect(out).toMatch(/\[Screenshot HTML\]/);
      consoleSpy.mockRestore();
    });
  });

  it("take_screenshot allows changing screenshot display format via RAILS_SYSTEM_TESTING_SCREENSHOT env", () => {
    vi.stubEnv("RAILS_SYSTEM_TESTING_SCREENSHOT", "artifact");
    const msgs: string[] = [];
    const consoleSpy = vi.spyOn(console, "log").mockImplementation((m: string) => msgs.push(m));
    const page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };
    host._page = page;
    return takeScreenshot.call(host).then(() => {
      expect(msgs.join("\n")).toMatch(/url=artifact:\/\//);
      consoleSpy.mockRestore();
    });
  });

  it("take_failed_screenshot persists the image path in the test metadata", () => {
    host._testFailed = true;
    const page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue("<html></html>"),
    };
    host._page = page;
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    return takeFailedScreenshot.call(host).then(() => {
      expect(host.metadata["failure_screenshot_path"]).toMatch(
        /tmp\/screenshots\/failures_x\.png$/,
      );
      consoleSpy.mockRestore();
    });
  });

  it("image path returns the absolute path from root", () => {
    // imagePath is constructed from projectRoot() (process.cwd())
    const path = imagePath.call(host);
    expect(path).toContain("tmp/screenshots");
    expect(path).toMatch(/tmp\/screenshots\/0_x\.png$/);
  });

  it("rack_test driver does not support screenshot", () => {
    expect(supportsScreenshot.call(host)).toBe(false);
  });

  it("selenium driver supports screenshot", () => {
    host._page = {
      screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      content: vi.fn().mockResolvedValue(""),
    };
    expect(supportsScreenshot.call(host)).toBe(true);
  });

  it("screenshotsDir defaults to tmp/screenshots", () => {
    expect(screenshotsDir()).toBe("tmp/screenshots");
  });

  it("inlineBase64 encodes a string", () => {
    expect(inlineBase64("hello")).toBe(Buffer.from("hello").toString("base64"));
  });

  it("displayImage shows screenshot path in simple mode", () => {
    const msg = displayImage.call(host, { html: false, screenshotOutput: "simple" });
    expect(msg).toMatch(/\[Screenshot Image\]/);
    expect(msg).not.toMatch(/\[Screenshot HTML\]/);
  });
});
