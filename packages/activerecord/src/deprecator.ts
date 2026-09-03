import { Deprecation } from "@blazetrails/activesupport";
import { gemVersion } from "./gem-version.js";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation();

export function deprecator(): Deprecation {
  return _deprecator;
}

export function version(): string {
  return gemVersion();
}

export interface ActiveRecord {
  deprecator(): Deprecation;
}
