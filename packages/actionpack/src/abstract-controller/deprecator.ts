import { Deprecation } from "@blazetrails/activesupport";

/**
 * Lazily-initialized Deprecation instance for the AbstractController
 * namespace. Mirrors Rails `AbstractController.deprecator`.
 *
 * @internal
 */
let _deprecator: Deprecation | undefined;
export function deprecator(): Deprecation {
  if (!_deprecator) _deprecator = new Deprecation();
  return _deprecator;
}
