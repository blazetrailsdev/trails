/**
 * ActionController::AllowBrowser
 *
 * Minimum browser version enforcement using `ua-parser-js` for
 * user agent parsing (matching Rails' use of the `useragent` gem).
 * @see https://api.rubyonrails.org/classes/ActionController/AllowBrowser.html
 */

import { UAParser } from "ua-parser-js";

export type BrowserVersions = "modern" | Record<string, string | false>;

const SETS: Record<string, Record<string, string | false>> = {
  modern: { safari: "17.2", chrome: "120", firefox: "121", opera: "106" },
};

export class BrowserBlocker {
  private _versions: Record<string, string | false>;
  private _userAgent: string;
  private _parser?: UAParser;

  constructor(userAgentString: string, versions: BrowserVersions) {
    this._userAgent = userAgentString;
    this._versions = typeof versions === "string" ? (SETS[versions] ?? {}) : versions;
  }

  private get parser(): UAParser {
    this._parser ??= new UAParser(this._userAgent);
    return this._parser;
  }

  get blocked(): boolean {
    if (!this._userAgent) return false;
    if (this._bot()) return false;

    const minimum = this._minimumVersionForBrowser();
    if (minimum === undefined) return false;
    if (minimum === false) return true;

    const browser = this.parser.getBrowser();
    if (!browser.version) return false;
    return this._compareVersions(browser.version, minimum) < 0;
  }

  private _bot(): boolean {
    return /bot|crawl|spider|slurp/i.test(this._userAgent);
  }

  private _minimumVersionForBrowser(): string | false | undefined {
    return this._versions[this._normalizedBrowserName()];
  }

  private _normalizedBrowserName(): string {
    const browser = this.parser.getBrowser();
    const name = (browser.name ?? "").toLowerCase();
    if (name === "internet explorer" || name === "ie") return "ie";
    if (name === "mobile chrome") return "chrome";
    if (name === "mobile safari") return "safari";
    if (name === "mobile firefox") return "firefox";
    return name;
  }

  private _compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}
