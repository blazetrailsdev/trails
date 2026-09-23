import { ArgumentError, extractOptionsBang } from "../../hash-utils.js";
import { Deprecation } from "../../deprecation.js";
import { deprecator as activeSupportDeprecator } from "../../deprecator.js";

export function deprecate(
  this: { prototype: object },
  ...methodNames: Array<string | Record<string, unknown>>
): void {
  const options = extractOptionsBang(methodNames as Array<string>);
  if (!("deprecator" in options)) throw new ArgumentError("missing keyword: :deprecator");
  const deprecator = options.deprecator as Deprecation | null | false;
  delete options.deprecator;
  const targetModule = this.prototype as Record<string, unknown>;
  if (deprecator instanceof Deprecation) {
    deprecator.deprecateMethods(targetModule, ...(methodNames as Array<string>), options);
  } else if (deprecator != null && deprecator !== false) {
    activeSupportDeprecator().deprecateMethods(targetModule, ...(methodNames as Array<string>), {
      ...options,
      deprecator,
    });
  }
}
