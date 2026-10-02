import { Deprecation } from "@blazetrails/activesupport";
import type { Gem } from "@blazetrails/ruby-compat";
import { gemVersion } from "./gem-version.js";

export { Deprecation as Deprecator };

const _deprecator = new Deprecation();

export function deprecator(): Deprecation {
  return _deprecator;
}

export function version(): InstanceType<typeof Gem.Version> {
  return gemVersion();
}

export interface ActiveRecord {
  deprecator(): Deprecation;
}
