import { Deprecation } from "@blazetrails/activesupport";

let _deprecator: Deprecation | undefined;

/** @internal */
export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}
