import { extractOptionsBang } from "../hash-utils.js";
import type { Deprecation } from "../deprecation.js";

/**
 * Declare that a method has been deprecated.
 *
 *   const deprecator = new Deprecation("next-release", "MyGem");
 *   deprecator.deprecateMethods(Fred.prototype, "aaa", { bbb: "zzz", ccc: "use Bar#ccc instead" });
 *
 * Mirrors: ActiveSupport::Deprecation::MethodWrapper#deprecate_methods
 * (deprecation/method_wrappers.rb:35-67).
 */
export function deprecateMethods(
  this: Deprecation,
  targetModule: Record<string, unknown>,
  ...methodNames: Array<string | Record<string, string>>
): Record<string, unknown> {
  const [names, options] = extractOptionsBang(methodNames as Array<string>);
  const deprecator = (options.deprecator as Deprecation | undefined) ?? this;
  delete options.deprecator;
  const methodNamesWithOptions = [...names, ...Object.keys(options)];

  for (const methodName of methodNamesWithOptions) {
    const message = options[methodName] as string | undefined;

    if (methodName in targetModule) {
      // Ruby's `method_defined?` arm: capture the existing implementation
      // (`instance_method`) and `redefine_method` over it.
      const method = targetModule[methodName] as (...args: unknown[]) => unknown;
      targetModule[methodName] = function (this: unknown, ...args: unknown[]): unknown {
        deprecator.deprecationWarning(methodName, message);
        return method.apply(this, args);
      };
    } else {
      // Ruby's `mod ||= Module.new` arm: nothing defines the name yet, so the
      // definition warns and then calls `super`. An own property shadows the
      // prototype chain exactly as a prepended module shadows its ancestors,
      // and resolving the inherited implementation at CALL time is what makes
      // `super` find one added after this point — or raise when none is.
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
