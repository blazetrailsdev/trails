import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface I18nConfig {
  railtiesLoadPath: string[];
  loadPath: string[];
  fallbacks: boolean | string[] | Record<string, unknown>;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    i18n: I18nConfig;
  }
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("i18n", {
      railtiesLoadPath: [],
      loadPath: [],
      fallbacks: {},
    } satisfies I18nConfig);
  }
}
