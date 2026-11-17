import { Deprecation } from "@blazetrails/activesupport";

/** @internal */
let _deprecator: Deprecation | undefined;
export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}
