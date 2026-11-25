import { classModule } from "@blazetrails/ruby-compat/class-module";
import { extractOptionsBang } from "../core-ext/array/extract-options.js";
import type { Deprecation } from "../deprecation.js";

export class MethodWrapper {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  deprecateMethods(
    this: Deprecation,
    targetModule: Record<string, unknown>,
    ...methodNames: Array<string | Record<string, unknown>>
  ): Record<string, unknown> {
    const options = extractOptionsBang(methodNames as Array<string>);
    const names = methodNames as Array<string>;
    const deprecator = (options.deprecator as Deprecation | undefined) ?? this;
    delete options.deprecator;
    const methodNamesWithOptions = [...names, ...Object.keys(options)];

    for (const methodName of methodNamesWithOptions) {
      const message = (options[methodName] as string | undefined) ?? null;

      if (methodName in targetModule) {
        const method = targetModule[methodName] as (...args: unknown[]) => unknown;
        targetModule[methodName] = function (this: unknown, ...args: unknown[]): unknown {
          deprecator.deprecationWarning(methodName, message);
          return method.apply(this, args);
        };
      } else {
        targetModule[methodName] = function (this: unknown, ...args: unknown[]): unknown {
          deprecator.deprecationWarning(methodName, message);
          const inherited = Object.getPrototypeOf(targetModule)?.[methodName] as (
            ...args: unknown[]
          ) => unknown;
          return inherited.apply(this, args);
        };
      }
    }

    return targetModule;
  }
}
