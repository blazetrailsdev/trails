import { File, Gem } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent PERMANENT */
export interface LaunchOptions {
  args: string[];
  headless: boolean;
  channel?: string;
  executablePath?: string;
  [key: string]: unknown;
}

/** @noRailsEquivalent PERMANENT */
export interface BrowserType {
  executablePath(): string;
}

const PLAYWRIGHT_MODULE = "playwright";

export class Browser {
  readonly name: string;
  private _options: LaunchOptions | undefined;

  constructor(name: string) {
    this.name = name;
  }

  get type(): string {
    switch (this.name) {
      case "headless_chrome":
        return "chrome";
      case "headless_firefox":
        return "firefox";
      default:
        return this.name;
    }
  }

  get options(): LaunchOptions | undefined {
    if (this._options == null) {
      switch (this.type) {
        case "chrome":
          this._options = this.defaultChromeOptions();
          break;
        case "firefox":
          this._options = this.defaultFirefoxOptions();
          break;
      }
    }
    return this._options;
  }

  configure(block?: (options: LaunchOptions | undefined) => void): void {
    if (block) block(this.options);
  }

  /** @missingRailsArgs resolve_driver_path — PERMANENT */
  async preload(): Promise<void> {
    switch (this.type) {
      case "chrome":
        await this.resolveDriverPath(
          ((await import(PLAYWRIGHT_MODULE)) as Record<string, BrowserType>).chromium,
        );
        break;
      case "firefox":
        await this.resolveDriverPath(
          ((await import(PLAYWRIGHT_MODULE)) as Record<string, BrowserType>).firefox,
        );
        break;
    }
  }

  /**
   * @internal
   * @missingRailsCall new — PERMANENT
   */
  private defaultChromeOptions(): LaunchOptions {
    const options: LaunchOptions = { args: [], headless: false };
    options.args.push("--disable-search-engine-choice-screen");
    if (this.name === "headless_chrome") {
      options.args.push("--headless");
      options.headless = true;
    }
    if (Gem.isWinPlatform()) options.args.push("--disable-gpu");
    return options;
  }

  /**
   * @internal
   * @missingRailsCall new — PERMANENT
   */
  private defaultFirefoxOptions(): LaunchOptions {
    const options: LaunchOptions = { args: [], headless: false };
    if (this.name === "headless_firefox") {
      options.args.push("-headless");
      options.headless = true;
    }
    return options;
  }

  /**
   * @internal
   * @missingRailsCall path — PERMANENT
   */
  private async resolveDriverPath(namespace: BrowserType): Promise<void> {
    const driverPath = namespace.executablePath();
    if (!(await File.isExistAsync(driverPath))) {
      throw new Error(`Executable doesn't exist at ${driverPath}`);
    }
    this.options!.executablePath = driverPath;
  }
}
