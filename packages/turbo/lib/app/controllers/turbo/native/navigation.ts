import { Concern, extend } from "@blazetrails/activesupport";
import { Turbo } from "../../../../turbo-trails.js";

type Options = Record<string, unknown>;
type NativeAction = "recede" | "resume" | "refresh";

interface NavigationHost {
  request: { userAgent: string | null };
  isHotwireNativeApp(): boolean;
  isTurboNativeApp(): boolean;
  redirectTo(options: unknown, responseOptions?: Options): unknown;
  redirectBack(options: { fallbackLocation: string } & Options): unknown;
  turboNativeActionOrRedirect(
    url: string,
    action: NativeAction,
    redirectType: "to" | "back",
    options?: Options,
  ): unknown;
}

type HistoricalLocationUrls = {
  [A in NativeAction as `turbo${Capitalize<A>}HistoricalLocationUrl`]: (options: Options) => string;
};

export const Navigation = {
  isHotwireNativeApp(this: NavigationHost): boolean {
    return /(Turbo|Hotwire) Native/.test(this.request.userAgent ?? "");
  },

  isTurboNativeApp: undefined as unknown as (this: NavigationHost) => boolean,

  recedeOrRedirectTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "recede", "to", options);
  },

  resumeOrRedirectTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "resume", "to", options);
  },

  refreshOrRedirectTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "refresh", "to", options);
  },

  recedeOrRedirectBackOrTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "recede", "back", options);
  },

  resumeOrRedirectBackOrTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "resume", "back", options);
  },

  refreshOrRedirectBackOrTo(this: NavigationHost, url: string, options: Options = {}): unknown {
    return this.turboNativeActionOrRedirect(url, "refresh", "back", options);
  },

  /** @internal */
  turboNativeActionOrRedirect(
    this: NavigationHost & HistoricalLocationUrls,
    url: string,
    action: NativeAction,
    redirectType: "to" | "back",
    options: Options = {},
  ): unknown {
    const { nativeParams = null, ...rest } = options;
    options = rest;
    const nativeParamsOrDefault = (nativeParams as Options | null) ?? {};

    if (this.isTurboNativeApp()) {
      const name =
        `turbo${(action[0].toUpperCase() + action.slice(1)) as Capitalize<NativeAction>}HistoricalLocationUrl` as const;
      return this.redirectTo(
        this[name]({ notice: options["notice"] ?? null, ...nativeParamsOrDefault }),
      );
    } else if (redirectType === "back") {
      return this.redirectBack({ fallbackLocation: url, ...options });
    } else {
      return this.redirectTo(url, options);
    }
  },
};
Navigation.isTurboNativeApp = Navigation.isHotwireNativeApp;
extend(Navigation, Concern);
(
  Navigation as unknown as {
    included(base: null, block: (this: { helperMethod(...m: string[]): void }) => void): void;
  }
).included(null, function (this: { helperMethod(...m: string[]): void }) {
  this.helperMethod("isHotwireNativeApp", "isTurboNativeApp");
});
Turbo.Native.Navigation = Navigation;
