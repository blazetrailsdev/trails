import { Deprecation } from "@blazetrails/activesupport";

/** @internal */
let _deprecator: Deprecation | undefined;
export function deprecator(): Deprecation {
  if (!_deprecator) _deprecator = new Deprecation();
  return _deprecator;
}
