import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation();

export function deprecator(): Deprecation {
  return _deprecator;
}

export interface ActiveModel {
  deprecator(): Deprecation;
}
