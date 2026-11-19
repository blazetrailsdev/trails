import { OrderedOptions } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface I18nFallbacksConfig extends OrderedOptions {
  defaults?: string[] | null;
  map?: Record<string, unknown> | null;
}

export interface I18nConfig extends OrderedOptions {
  railtiesLoadPath: unknown[];
  loadPath: unknown[];
  fallbacks: boolean | unknown[] | Record<string, unknown> | I18nFallbacksConfig;
  backend?: unknown;
  defaultLocale?: string | null;
  availableLocales?: string | string[] | null;
  enforceAvailableLocales?: boolean | null;
  locale?: string | null;
  defaultSeparator?: string | null;
  exceptionHandler?: unknown;
  raiseOnMissingTranslations?: boolean | string | null;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    i18n: I18nConfig;
  }
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("i18n", new OrderedOptions());
    this.config.i18n.railtiesLoadPath = [];
    this.config.i18n.loadPath = [];
    this.config.i18n.fallbacks = new OrderedOptions();
  }
}
