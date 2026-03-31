/**
 * ActionController::AllowBrowser
 *
 * Minimum browser version enforcement.
 * @see https://api.rubyonrails.org/classes/ActionController/AllowBrowser.html
 */

export type BrowserVersions = "modern" | Record<string, string>;

const MODERN_MINIMUM_VERSIONS: Record<string, string> = {
  safari: "17.2",
  chrome: "120",
  firefox: "121",
  opera: "106",
};

export class BrowserBlocker {
  private _versions: Record<string, string>;
  private _userAgent: string;

  constructor(userAgent: string, versions: BrowserVersions) {
    this._userAgent = userAgent;
    this._versions = versions === "modern" ? MODERN_MINIMUM_VERSIONS : versions;
  }

  get blocked(): boolean {
    for (const [browser, minVersion] of Object.entries(this._versions)) {
      const version = this._detectVersion(browser);
      if (version !== null && this._compareVersions(version, minVersion) < 0) {
        return true;
      }
    }
    return false;
  }

  private _detectVersion(browser: string): string | null {
    const ua = this._userAgent.toLowerCase();
    const patterns: Record<string, RegExp> = {
      safari: /version\/(\d+(?:\.\d+)*)/,
      chrome: /chrome\/(\d+(?:\.\d+)*)/,
      firefox: /firefox\/(\d+(?:\.\d+)*)/,
      opera: /opr\/(\d+(?:\.\d+)*)/,
    };
    const pattern = patterns[browser.toLowerCase()];
    if (!pattern) return null;
    const match = ua.match(pattern);
    return match ? match[1] : null;
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
