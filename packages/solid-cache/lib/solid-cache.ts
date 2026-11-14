import { mattrAccessor } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import type { Connections } from "./connections.js";
import type { Engine } from "./engine.js";
import type { Entry } from "./entry.js";
import type { ExpiryJob } from "./expiry-job.js";
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
  Engine?: typeof Engine;
  Connections?: typeof Connections;
  Entry?: typeof Entry;
  ExpiryJob?: typeof ExpiryJob;
  Record?: typeof Record;
  Store?: typeof Store;
  MaglevHash?: typeof MaglevHash;
};

mattrAccessor.call(SolidCache, "executor");
mattrAccessor.call(SolidCache, "configuration", { default: new Configuration() });

SolidCache.Configuration = Configuration;

TopLevel.SolidCache = SolidCache;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    SolidCache?: typeof SolidCache;
  }
}
