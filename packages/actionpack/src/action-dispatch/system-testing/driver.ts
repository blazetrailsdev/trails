import type { LaunchOptions } from "playwright";
import { compact } from "@blazetrails/activesupport";
import type { RackMiddleware } from "@blazetrails/rack";
import { Session } from "@blazetrails/rack-test";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { Browser } from "./browser.js";
import { vite } from "./server.js";

export type BrowserName =
  | "chromium"
  | "firefox"
  | "webkit"
  | "chrome"
  | "headless_chrome"
  | "headless_firefox";

export interface DriverOptions {
  using?: BrowserName;
  screenSize?: [number, number];
  options?: Record<string, unknown>;
}

/** @internal */
let playwrightModule: Record<string, unknown> | undefined;
const PLAYWRIGHT_MODULE = "playwright";

/** @noRailsEquivalent PERMANENT */
export async function requirePlaywright(): Promise<Record<string, unknown>> {
  if (playwrightModule) return playwrightModule;
  try {
    playwrightModule = (await import(PLAYWRIGHT_MODULE)) as Record<string, unknown>;
    return playwrightModule;
  } catch {
    throw new Error(
      "Playwright is required for system tests. Install it with: pnpm add playwright",
    );
  }
}

interface BrowserType {
  launch(options: Record<string, unknown>): Promise<unknown>;
}

export class Driver {
  readonly name: string;
  private _driverType: string;
  private _screenSize: [number, number] | undefined;
  private _options: Record<string, unknown>;
  private _capabilities: ((options: LaunchOptions | undefined) => void) | undefined;
  private _browser: Browser | null;
  private _preload: Promise<void> | undefined;

  constructor(
    driverType: string,
    options: DriverOptions = {},
    capabilities?: (options: LaunchOptions | undefined) => void,
  ) {
    this._driverType = driverType;
    this._screenSize = options.screenSize;
    this._options = { ...(options.options ?? {}) };
    const name = this._options.name as string | undefined;
    delete this._options.name;
    this.name = name ?? driverType;
    this._capabilities = capabilities;

    if (driverType === "selenium") {
      this._browser = new Browser(options.using);
      if (this._options.browser !== "remote") {
        this._preload = this._browser.preload();
      }
    } else {
      this._browser = null;
    }
  }

  use(): void {
    if (this.registerable()) this.register();

    this.setup();
  }

  /** @internal */
  private registerable(): boolean {
    return ["selenium", "cuprite", "rack_test", "playwright"].includes(this._driverType);
  }

  /** @internal */
  private register(): void {
    this._browser?.configure(this._capabilities);

    vite.drivers[this.name] = async (app) => {
      switch (this._driverType) {
        case "selenium":
          return this.registerSelenium(app);
        case "cuprite":
          return this.registerCuprite(app);
        case "rack_test":
          return this.registerRackTest(app);
        case "playwright":
          return this.registerPlaywright(app);
      }
    };
  }

  /** @internal */
  private browserOptions(): Record<string, unknown> {
    return compact({ ...this._options, options: this._browser!.options });
  }

  /** @internal */
  private async registerSelenium(app: RackMiddleware | undefined): Promise<unknown> {
    await this._preload;
    this.browserOptions();
    // @nie disposition=port-real rails=actionpack/lib/action_dispatch/system_testing/driver.rb:55
    throw new NotImplementedError(
      "selenium is not implemented; see converge-driver-selenium-arm-onto-webdriverio",
    );
  }

  /**
   * @internal
   * @inventedArm launch — PERMANENT
   */
  private async registerCuprite(app: RackMiddleware | undefined): Promise<unknown> {
    const options = { ...this._options, windowSize: this._screenSize };
    const { chromium } = (await requirePlaywright()) as { chromium: BrowserType };
    return { app, options, browser: await chromium.launch(this._options) };
  }

  /**
   * @internal
   * @missingRailsArgs new — CONVERGEABLE driver-rack-test-arm-passes-respect-data-method
   */
  private async registerRackTest(app: RackMiddleware | undefined): Promise<unknown> {
    return new Session(app!);
  }

  /**
   * @internal
   * @inventedArm launch — PERMANENT
   */
  private async registerPlaywright(app: RackMiddleware | undefined): Promise<unknown> {
    let screen: { width: number; height: number } | undefined;
    if (this._screenSize) screen = { width: this._screenSize[0], height: this._screenSize[1] };
    const options = compact({
      screen: screen,
      viewport: screen,
      ...this._options,
    });

    const { chromium } = (await requirePlaywright()) as { chromium: BrowserType };
    return { app, options, browser: await chromium.launch(this._options) };
  }

  /** @internal */
  private setup(): void {
    vite.currentDriver = this.name;
  }
}
