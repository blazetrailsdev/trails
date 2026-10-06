import type { Gem } from "@blazetrails/ruby-compat";
import { gemVersion } from "./gem-version.js";

export function version(): InstanceType<typeof Gem.Version> {
  return gemVersion();
}
