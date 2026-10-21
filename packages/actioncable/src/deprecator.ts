import { Deprecation } from "@blazetrails/activesupport";

let _deprecator: Deprecation | undefined;

export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}
