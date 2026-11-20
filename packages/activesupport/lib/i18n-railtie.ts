import {
  Fallbacks,
  LocaleFallbacks,
  backend,
  defaultLocale,
  setFallbacks,
} from "@blazetrails/i18n";
import { include, rbInspect, RuntimeError } from "@blazetrails/ruby-compat";
import { isPlainObject } from "./hash-utils.js";
import { OrderedOptions } from "./ordered-options.js";

type FallbacksSetting = OrderedOptions | Record<string, unknown> | unknown[] | boolean;

export class Railtie {
  static includeFallbacksModule(): void {
    include(backend().constructor as new (...args: never[]) => object, Fallbacks);
  }

  static initFallbacks(fallbacks: FallbacksSetting): void {
    this.includeFallbacksModule();

    let args: unknown[];
    if (fallbacks instanceof OrderedOptions) {
      args = [
        ...((fallbacks.get("defaults") as unknown[] | null) || []),
        fallbacks.get("map"),
      ].filter((x) => x != null);
    } else if (isPlainObject(fallbacks) || Array.isArray(fallbacks)) {
      args = Array.isArray(fallbacks) ? fallbacks : [fallbacks];
    } else {
      args = [defaultLocale()];
    }

    setFallbacks(new LocaleFallbacks(...(args as ConstructorParameters<typeof LocaleFallbacks>)));
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
