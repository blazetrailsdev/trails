import { I18n, OrderedOptions, isPlainObject } from "@blazetrails/activesupport";
import { include, rbInspect, RuntimeError } from "@blazetrails/ruby-compat";
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

  static includeFallbacksModule(): void {
    include(I18n.backend().constructor as new (...args: never[]) => object, I18n.Fallbacks);
  }

  static initFallbacks(fallbacks: I18nConfig["fallbacks"]): void {
    this.includeFallbacksModule();

    let args: unknown[];
    if (fallbacks instanceof OrderedOptions) {
      args = [...((fallbacks.defaults as unknown[] | null) || []), fallbacks.map].filter(
        (x) => x != null,
      );
    } else if (isPlainObject(fallbacks) || Array.isArray(fallbacks)) {
      args = Array.isArray(fallbacks) ? fallbacks : [fallbacks];
    } else {
      args = [I18n.defaultLocale()];
    }

    I18n.setFallbacks(
      new I18n.LocaleFallbacks(...(args as ConstructorParameters<typeof I18n.LocaleFallbacks>)),
    );
  }

  static validateFallbacks(fallbacks: unknown): boolean {
    if (fallbacks instanceof OrderedOptions) {
      return fallbacks.keys().length > 0;
    } else if (fallbacks === true || Array.isArray(fallbacks) || isPlainObject(fallbacks)) {
      return true;
    } else {
      throw new RuntimeError(`Unexpected fallback type ${rbInspect(fallbacks)}`);
    }
  }
}
