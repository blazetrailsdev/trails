import { Deprecation } from "@blazetrails/activesupport";

const _deprecator = new Deprecation();

export function deprecator(): Deprecation {
  return _deprecator;
}
