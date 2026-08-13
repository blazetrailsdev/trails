import { extractOptions } from "../hash-utils.js";
import type { Deprecation } from "../deprecation.js";

/**
 * Declare that a method has been deprecated.
 *
 *   const deprecator = new Deprecation("next-release", "MyGem");
 *   deprecator.deprecateMethods(Fred.prototype, "aaa", { bbb: "zzz", ccc: "use Bar#ccc instead" });
 *
 * Mirrors: ActiveSupport::Deprecation::MethodWrapper#deprecate_methods
 * (deprecation/method_wrappers.rb:35-67).
 *
 * Ruby's two arms — redefining an owned method vs. prepending a module for one
 * that is only inherited — collapse into one here: a JS function assigned to
 * `targetModule` shadows an inherited one exactly as Ruby's prepended module
 * does, and the captured `method` is the inherited implementation the prepended
 * arm reaches with `super`.
 */
export function deprecateMethods(
  this: Deprecation,
  targetModule: Record<string, unknown>,
  ...methodNames: Array<string | Record<string, string>>
): Record<string, unknown> {
  const [names, options] = extractOptions(methodNames as Array<string>);
  const deprecator = (options.deprecator as Deprecation | undefined) ?? this;
  delete options.deprecator;
  const methodNamesWithOptions = [...names, ...Object.keys(options)];

  for (const methodName of methodNamesWithOptions) {
    const message = options[methodName] as string | undefined;
    const method = targetModule[methodName] as ((...args: unknown[]) => unknown) | undefined;

    targetModule[methodName] = function (this: unknown, ...args: unknown[]): unknown {
      deprecator.deprecationWarning(methodName, message);
      // Ruby's second arm defines the method in a prepended module whose body
      // calls `super` — which raises NoMethodError when nothing defines it. A
      // missing JS method is the same call, so the warning still fires first.
      return (method as (...args: unknown[]) => unknown).apply(this, args);
    };
  }

  return targetModule;
}
