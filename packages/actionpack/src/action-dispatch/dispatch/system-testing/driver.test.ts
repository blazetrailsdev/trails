import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { BrowserType, LaunchOptions } from "playwright";
import { assertNoChanges } from "@blazetrails/activesupport";
import { rbObjIvarGet } from "@blazetrails/ruby-compat";
import { Driver, requirePlaywright } from "../../system-testing/driver.js";
import { serviceDriverPath, type Browser } from "../../system-testing/browser.js";

const foundExecutable = new URL(import.meta.url).pathname;
let chromium: BrowserType;
let firefox: BrowserType;

beforeAll(async () => {
  ({ chromium, firefox } = (await requirePlaywright()) as {
    chromium: BrowserType;
    firefox: BrowserType;
  });
  vi.spyOn(chromium, "executablePath").mockImplementation(() => foundExecutable);
  vi.spyOn(firefox, "executablePath").mockImplementation(() => foundExecutable);
});

afterAll(() => {
  vi.restoreAllMocks();
});

function setDriverPath(namespace: BrowserType, path: string | undefined): void {
  if (path === undefined) serviceDriverPath.delete(namespace);
  else serviceDriverPath.set(namespace, path);
}

function browserOf(driver: Driver): Browser {
  return rbObjIvarGet(driver, "@browser") as Browser;
}

describe("DriverTest", () => {
  it("initializing the driver", () => {
    const driver = new Driver("selenium");
    expect(rbObjIvarGet(driver, "@driver_type")).toBe("selenium");
  });

  it("initializing the driver with a browser", () => {
    const driver = new Driver("selenium", {
      using: "chrome",
      screenSize: [1400, 1400],
      options: { url: "http://example.com/wd/hub" },
    });
    expect(rbObjIvarGet(driver, "@driver_type")).toBe("selenium");
    expect(browserOf(driver).name).toBe("chrome");
    expect(browserOf(driver).options!.args).toEqual(["--disable-search-engine-choice-screen"]);
    expect(rbObjIvarGet(driver, "@screen_size")).toEqual([1400, 1400]);
    expect(rbObjIvarGet(driver, "@options")).toEqual({ url: "http://example.com/wd/hub" });
  });

  it("initializing the driver with a headless chrome", () => {
    const driver = new Driver("selenium", {
      using: "headless_chrome",
      screenSize: [1400, 1400],
      options: { url: "http://example.com/wd/hub" },
    });
    expect(rbObjIvarGet(driver, "@driver_type")).toBe("selenium");
    expect(browserOf(driver).name).toBe("headless_chrome");
    expect(browserOf(driver).options!.args).toEqual([
      "--disable-search-engine-choice-screen",
      "--headless",
    ]);
    expect(rbObjIvarGet(driver, "@screen_size")).toEqual([1400, 1400]);
    expect(rbObjIvarGet(driver, "@options")).toEqual({ url: "http://example.com/wd/hub" });
  });

  it("initializing the driver with a headless chrome and custom path", () => {
    const originalDriverPath = serviceDriverPath.get(chromium);
    try {
      expect(() => {
        serviceDriverPath.set(chromium, "bin/test");
        new Driver("selenium", { using: "headless_chrome", screenSize: [1400, 1400] });
      }).not.toThrow();
    } finally {
      setDriverPath(chromium, originalDriverPath);
    }
  });

  it("initializing the driver with a headless firefox", () => {
    const driver = new Driver("selenium", {
      using: "headless_firefox",
      screenSize: [1400, 1400],
      options: { url: "http://example.com/wd/hub" },
    });
    expect(rbObjIvarGet(driver, "@driver_type")).toBe("selenium");
    expect(browserOf(driver).name).toBe("headless_firefox");
    expect(browserOf(driver).options!.args).toEqual(["-headless"]);
    expect(rbObjIvarGet(driver, "@screen_size")).toEqual([1400, 1400]);
    expect(rbObjIvarGet(driver, "@options")).toEqual({ url: "http://example.com/wd/hub" });
  });

  it("initializing the driver with a headless firefox and custom path", () => {
    const originalDriverPath = serviceDriverPath.get(firefox);
    try {
      expect(() => {
        serviceDriverPath.set(firefox, "bin/test");
        new Driver("selenium", { using: "headless_firefox", screenSize: [1400, 1400] });
      }).not.toThrow();
    } finally {
      setDriverPath(firefox, originalDriverPath);
    }
  });

  it("initializing the driver with a cuprite", () => {
    const driver = new Driver("cuprite", {
      screenSize: [1400, 1400],
      options: { jsErrors: false },
    });
    expect(rbObjIvarGet(driver, "@driver_type")).toBe("cuprite");
    expect(rbObjIvarGet(driver, "@screen_size")).toEqual([1400, 1400]);
    expect(rbObjIvarGet(driver, "@options")).toEqual({ jsErrors: false });
  });

  it("initializing the driver with Playwright", () => {
    const driver = new Driver("playwright", {
      screenSize: [1400, 1400],
      options: { headless: true },
    });

    expect(rbObjIvarGet(driver, "@driver_type")).toBe("playwright");
    expect(rbObjIvarGet(driver, "@screen_size")).toEqual([1400, 1400]);
    expect(rbObjIvarGet(driver, "@options")).toEqual({ headless: true });
  });

  it("define extra capabilities using chrome", () => {
    const driver = new Driver(
      "selenium",
      { screenSize: [1400, 1400], using: "chrome" },
      (option) => {
        option!.args!.push("start-maximized");
      },
    );
    driver.use();

    const expected = {
      args: ["--disable-search-engine-choice-screen", "start-maximized"],
      headless: false,
    };
    assertDriverCapabilities(driver, expected);
  });

  it("define extra capabilities using headless_chrome", () => {
    const driver = new Driver(
      "selenium",
      { screenSize: [1400, 1400], using: "headless_chrome" },
      (option) => {
        option!.args!.push("start-maximized");
      },
    );
    driver.use();

    const expected = {
      args: ["--disable-search-engine-choice-screen", "--headless", "start-maximized"],
      headless: true,
    };
    assertDriverCapabilities(driver, expected);
  });

  it("define extra capabilities using firefox", () => {
    const driver = new Driver(
      "selenium",
      { screenSize: [1400, 1400], using: "firefox" },
      (option) => {
        option!.firefoxUserPrefs = { "browser.startup.homepage": "http://www.seleniumhq.com/" };
        option!.args!.push("--host=127.0.0.1");
      },
    );
    driver.use();

    const expected = {
      args: ["--host=127.0.0.1"],
      firefoxUserPrefs: { "browser.startup.homepage": "http://www.seleniumhq.com/" },
    };
    assertDriverCapabilities(driver, expected);
  });

  it("define extra capabilities using headless_firefox", () => {
    const driver = new Driver(
      "selenium",
      { screenSize: [1400, 1400], using: "headless_firefox" },
      (option) => {
        option!.firefoxUserPrefs = { "browser.startup.homepage": "http://www.seleniumhq.com/" };
        option!.args!.push("--host=127.0.0.1");
      },
    );
    driver.use();

    const expected = {
      args: ["-headless", "--host=127.0.0.1"],
      firefoxUserPrefs: { "browser.startup.homepage": "http://www.seleniumhq.com/" },
    };
    assertDriverCapabilities(driver, expected);
  });

  it("does not define extra capabilities", () => {
    const driver = new Driver("selenium", { screenSize: [1400, 1400], using: "firefox" });

    expect(() => {
      driver.use();
    }).not.toThrow();
  });

  it("preloads browser's driver_path with DriverFinder if a path isn't already specified", async () => {
    const originalDriverPath = serviceDriverPath.get(chromium);
    try {
      serviceDriverPath.delete(chromium);
      const driver = new Driver("selenium", { screenSize: [1400, 1400], using: "chrome" });
      await (driver as unknown as { _preload: Promise<void> })._preload;

      expect(serviceDriverPath.get(chromium)).toBe(foundExecutable);
    } finally {
      setDriverPath(chromium, originalDriverPath);
    }
  });

  it("does not overwrite existing driver_path during preload", async () => {
    const originalDriverPath = serviceDriverPath.get(chromium);
    try {
      serviceDriverPath.set(chromium, "bin/test");

      await assertNoChanges(
        () => serviceDriverPath.get(chromium),
        null,
        {},
        async () => {
          const driver = new Driver("selenium", { screenSize: [1400, 1400], using: "chrome" });
          await (driver as unknown as { _preload: Promise<void> })._preload;
        },
      );
    } finally {
      setDriverPath(chromium, originalDriverPath);
    }
  });

  it("does not configure browser if driver is not :selenium", () => {
    expect(rbObjIvarGet(new Driver("selenium"), "@browser")).toBeTruthy();

    expect(rbObjIvarGet(new Driver("rack_test"), "@browser")).toBeNull();
    expect(rbObjIvarGet(new Driver("cuprite"), "@browser")).toBeNull();
  });

  it("driver names default to driver type", () => {
    const driver = new Driver("selenium");
    expect(driver.name).toBe("selenium");
  });

  it("driver names can by specified explicitly", () => {
    const driver = new Driver("selenium", { options: { name: "best_driver" } });
    expect(driver.name).toBe("best_driver");
  });
});

function assertDriverCapabilities(driver: Driver, expectedCapabilities: LaunchOptions): void {
  const capabilities = (
    driver as unknown as { browserOptions(): { options: LaunchOptions } }
  ).browserOptions().options;

  expect(
    Object.fromEntries(
      Object.keys(expectedCapabilities).map((k) => [k, capabilities[k as keyof LaunchOptions]]),
    ),
  ).toEqual(expectedCapabilities);
}
