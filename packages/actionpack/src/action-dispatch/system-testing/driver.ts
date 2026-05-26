export type BrowserName = "chromium" | "firefox" | "webkit";

export interface DriverOptions {
  using?: BrowserName;
  screenSize?: [number, number];
  options?: Record<string, unknown>;
}

export interface PlaywrightBrowserContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

export interface PlaywrightPage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface PlaywrightBrowser {
  newContext(options?: Record<string, unknown>): Promise<PlaywrightBrowserContext>;
  close(): Promise<void>;
}

/** @internal */
let playwrightModule: Record<string, unknown> | undefined;
const PLAYWRIGHT_MODULE = "playwright";

async function requirePlaywright(): Promise<Record<string, unknown>> {
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

export class Driver {
  readonly name: string;
  private _driverType: string;
  private _screenSize: [number, number];
  private _options: Record<string, unknown>;
  private _using: BrowserName;
  private _browser: PlaywrightBrowser | undefined;

  constructor(driverType: string, options: DriverOptions = {}) {
    this._driverType = driverType;
    this._using = options.using ?? "chromium";
    this._screenSize = options.screenSize ?? [1400, 1400];
    const opts = { ...(options.options ?? {}) };
    this.name = (opts.name as string) ?? driverType;
    delete opts.name;
    this._options = opts;
  }

  async use(): Promise<void> {
    if (this._browser) return;
    if (this.registerable()) await this.register();
    this.setup();
  }

  /** @internal */
  private registerable(): boolean {
    return (["selenium", "cuprite", "rack_test", "playwright"] as string[]).includes(
      this._driverType,
    );
  }

  /** @internal */
  private async register(): Promise<void> {
    switch (this._driverType) {
      case "selenium":
        this.registerSelenium();
        break;
      case "cuprite":
        this.registerCuprite();
        break;
      case "rack_test":
        this.registerRackTest();
        break;
      case "playwright":
        await this.registerPlaywright();
        break;
    }
  }

  /** @internal */
  private browserOptions(): Record<string, unknown> {
    return { ...this._options };
  }

  /** @internal */
  private registerSelenium(): void {
    throw new Error("Selenium is not supported. Use playwright.");
  }
  /** @internal */
  private registerCuprite(): void {
    throw new Error("Cuprite is not supported. Use playwright.");
  }
  /** @internal */
  private registerRackTest(): void {
    throw new Error("RackTest is not supported. Use playwright.");
  }

  /** @internal */
  private async registerPlaywright(): Promise<void> {
    const pw = await requirePlaywright();
    const browserType = pw[this._using] as {
      launch(opts: Record<string, unknown>): Promise<PlaywrightBrowser>;
    };
    this._browser = await browserType.launch(this.browserOptions());
  }

  /** @internal */
  private setup(): void {}

  /** @internal */
  async newContext(): Promise<PlaywrightBrowserContext> {
    if (!this._browser) throw new Error("Driver not started. Call use() first.");
    return this._browser.newContext({
      viewport: { width: this._screenSize[0], height: this._screenSize[1] },
    });
  }

  /** @internal */
  async newPage(): Promise<PlaywrightPage> {
    const context = await this.newContext();
    return context.newPage();
  }

  /** @internal */
  async close(): Promise<void> {
    await this._browser?.close();
    this._browser = undefined;
  }
}
