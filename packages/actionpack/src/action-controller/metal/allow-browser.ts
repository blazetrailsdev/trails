import { UAParser } from "ua-parser-js";
import {
  Concern,
  Module,
  Notifications,
  TopLevel,
  extend,
  type Included,
} from "@blazetrails/activesupport";
import { File, rbFSend } from "@blazetrails/ruby-compat";

import type { Request } from "../../action-dispatch/http/request.js";
import type { CallbackOptions, beforeAction } from "../../abstract-controller/callbacks.js";

export type BrowserVersions = "modern" | Record<string, string | false>;

type Block = ((this: any) => unknown) | string;

/** @internal */
export interface AllowBrowserClassHost {
  beforeAction: OmitThisParameter<typeof beforeAction>;
}

interface AllowBrowserHost {
  request: Request;
  render(options: Record<string, unknown>): unknown;
}

export const ClassMethods = {
  allowBrowser(
    this: AllowBrowserClassHost,
    {
      versions,
      block = function (this: AllowBrowserHost) {
        return this.render({
          file: File.join(TopLevel.Trails!.root()!, "public/406-unsupported-browser.html"),
          layout: false,
          status: "not_acceptable",
        });
      },
      ...options
    }: { versions: BrowserVersions; block?: Block } & CallbackOptions,
  ): void {
    this.beforeAction(
      (controller) =>
        (controller as unknown as Included<typeof AllowBrowser>).allowBrowser({
          versions: versions,
          block: block,
        }),
      options,
    );
  },
};

export const AllowBrowser = new Module((mod) => {
  extend(mod, Concern);

  mod.defineMethod("allowBrowser", allowBrowser);
}) as Module<{ allowBrowser: typeof allowBrowser }> & { ClassMethods: typeof ClassMethods };
AllowBrowser.ClassMethods = ClassMethods;

/**
 * @missingRailsCall require — PERMANENT
 * @internal
 */
export async function allowBrowser(
  this: AllowBrowserHost,
  { versions, block }: { versions: BrowserVersions; block: Block },
): Promise<void> {
  if (new BrowserBlocker(this.request, { versions: versions }).blocked) {
    await Notifications.instrument(
      "browser_block.action_controller",
      { request: this.request, versions: versions },
      () => (typeof block === "string" ? rbFSend(this, block) : block.call(this)),
    );
  }
}

const SETS: Record<string, Record<string, string | false>> = {
  modern: { safari: "17.2", chrome: "120", firefox: "121", opera: "106", ie: false },
};

export class BrowserBlocker {
  private _request: Request;
  private _versions: BrowserVersions;
  private _parsed?: UAParser;
  private _expanded?: Record<string, string | false>;

  constructor(request: Request, { versions }: { versions: BrowserVersions }) {
    this._request = request;
    this._versions = versions;
  }

  get request(): Request {
    return this._request;
  }

  get versions(): Record<string, string | false> {
    return { ...this.expandedVersions() };
  }

  get blocked(): boolean {
    return this.isUserAgentVersionReported() && this.isUnsupportedBrowser();
  }

  /** @internal */
  parsedUserAgent(): UAParser {
    this._parsed ??= new UAParser(this.request.userAgent ?? "");
    return this._parsed;
  }

  /** @internal */
  isUserAgentVersionReported(): boolean {
    if (!this.request.userAgent) return false;
    const version = this.parsedUserAgent().getBrowser().version ?? "";
    return version.length > 0;
  }

  /** @internal */
  isUnsupportedBrowser(): boolean {
    return this.isVersionGuardedBrowser() && this.isVersionBelowMinimumRequired() && !this.isBot();
  }

  /** @internal */
  isVersionGuardedBrowser(): boolean {
    return this.minimumBrowserVersionForBrowser() !== undefined;
  }

  /** @internal */
  isBot(): boolean {
    return /bot|crawl|spider|slurp/i.test(this.request.userAgent ?? "");
  }

  /** @internal */
  isVersionBelowMinimumRequired(): boolean {
    const minimum = this.minimumBrowserVersionForBrowser();
    if (minimum === undefined) return true;
    if (minimum === false) return true;
    const version = this.parsedUserAgent().getBrowser().version ?? "";
    return compareVersions(version, minimum) < 0;
  }

  /** @internal */
  minimumBrowserVersionForBrowser(): string | false | undefined {
    return this.expandedVersions()[this.normalizedBrowserName()];
  }

  /** @internal */
  expandedVersions(): Record<string, string | false> {
    if (!this._expanded) {
      const v = this._versions;
      this._expanded = typeof v === "string" ? (SETS[v] ?? {}) : v;
    }
    return this._expanded;
  }

  /** @internal */
  normalizedBrowserName(): string {
    const name = (this.parsedUserAgent().getBrowser().name ?? "").toLowerCase();
    if (name === "internet explorer" || name === "ie") return "ie";
    if (name === "mobile chrome") return "chrome";
    if (name === "mobile safari") return "safari";
    if (name === "mobile firefox") return "firefox";
    return name;
  }
}

function compareVersions(a: string, b: string): number {
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
