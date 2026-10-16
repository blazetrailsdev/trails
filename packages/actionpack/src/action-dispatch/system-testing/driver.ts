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
  private driverType: string;
  private screenSize: [number, number] | undefined;
  private options: Record<string, unknown>;
  private capabilities: ((options: LaunchOptions | undefined) => void) | undefined;
  private browser: Browser | null;
  private _preload: Promise<void> | undefined;

  constructor(
    driverType: string,
    options: DriverOptions = {},
    capabilities?: (options: LaunchOptions | undefined) => void,
  ) {
    this.driverType = driverType;
    this.screenSize = options.screenSize;
    this.options = { ...(options.options ?? {}) };
    const name = this.options.name as string | undefined;
    delete this.options.name;
    this.name = name ?? driverType;
    this.capabilities = capabilities;

    if (driverType === "selenium") {
      this.browser = new Browser(options.using);
      if (this.options.browser !== "remote") {
        this._preload = this.browser.preload();
        this._preload.catch(() => {});
      }
    } else {
      this.browser = null;
    }
  }

  use(): void {
    if (this.registerable()) this.register();

    this.setup();
  }

  /** @internal */
  private registerable(): boolean {
    return ["selenium", "cuprite", "rack_test", "playwright"].includes(this.driverType);
  }

  /** @internal */
  private register(): void {
    this.browser?.configure(this.capabilities);

    vite.drivers[this.name] = async (app) => {
      switch (this.driverType) {
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
    return compact({ ...this.options, options: this.browser!.options });
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
    const options = { ...this.options, windowSize: this.screenSize };
    const { chromium } = (await requirePlaywright()) as { chromium: BrowserType };
    return { app, options, browser: await chromium.launch(this.options) };
  }

  /** @internal */
  private async registerRackTest(app: RackMiddleware | undefined): Promise<unknown> {
    return {
      app,
      options: { respectDataMethod: true, ...this.options },
      session: new Session(app!),
    };
  }

  /**
   * @internal
   * @inventedArm launch — PERMANENT
   */
  private async registerPlaywright(app: RackMiddleware | undefined): Promise<unknown> {
    let screen: { width: number; height: number } | undefined;
    if (this.screenSize) screen = { width: this.screenSize[0], height: this.screenSize[1] };
    const options = compact({
      screen: screen,
      viewport: screen,
      ...this.options,
    });

    const { chromium } = (await requirePlaywright()) as { chromium: BrowserType };
    return { app, options, browser: await chromium.launch(this.options) };
  }

  /** @internal */
  private setup(): void {
    vite.currentDriver = this.name;
  }
}
