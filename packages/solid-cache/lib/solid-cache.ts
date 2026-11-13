import { mattrAccessor } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import type { Configuration } from "./configuration.js";
import type { Connections } from "./connections.js";
import type { Entry } from "./entry.js";
import type { MaglevHash } from "./maglev-hash.js";
import type { Record } from "./record.js";
import type { Store } from "./store.js";

export const SolidCache = {
  name: "SolidCache",
} as {
  name: "SolidCache";
  executor: unknown;
  configuration: Configuration;
  Configuration?: typeof Configuration;
  Connections?: typeof Connections;
  Entry?: typeof Entry;
  Record?: typeof Record;
  Store?: typeof Store;
  MaglevHash?: typeof MaglevHash;
};

mattrAccessor.call(SolidCache, "executor");
mattrAccessor.call(SolidCache, "configuration");

TopLevel.SolidCache = SolidCache;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    SolidCache?: typeof SolidCache;
  }
}
