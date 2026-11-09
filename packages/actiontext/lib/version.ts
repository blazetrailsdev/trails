import type { Gem } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { gemVersion } from "./gem-version.js";

export function version(): InstanceType<typeof Gem.Version> {
  return gemVersion();
}

ActionText.version = version;
