import type { Gem } from "@blazetrails/ruby-compat/gem";
import { gemVersion } from "./gem-version.js";

export function version(): InstanceType<typeof Gem.Version> {
  return gemVersion();
}
