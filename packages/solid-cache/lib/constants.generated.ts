import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./connections.js";
import * as m2 from "./connections/sharded.js";
import * as m3 from "./connections/single.js";
import * as m4 from "./connections/unmanaged.js";
import * as m5 from "./engine.js";
import * as m6 from "./entry.js";
import * as m7 from "./entry/encryption.js";
import * as m8 from "./maglev-hash.js";
import * as m9 from "./record.js";
import * as m10 from "./store.js";
import * as m11 from "./store/api.js";
import * as m12 from "./store/connections.js";
import * as m13 from "./store/entries.js";
import * as m14 from "./store/failsafe.js";

defineConstants([
  [() => m0.Configuration, "SolidCache::Configuration"],
  [() => m1.Connections, "SolidCache::Connections"],
  [() => m2.Sharded, "SolidCache::Connections::Sharded"],
  [() => m3.Single, "SolidCache::Connections::Single"],
  [() => m4.Unmanaged, "SolidCache::Connections::Unmanaged"],
  [() => m5.Engine, "SolidCache::Engine"],
  [() => m6.Entry, "SolidCache::Entry"],
  [() => m7.Encryption, "SolidCache::Entry::Encryption"],
  [() => m8.MaglevHash, "SolidCache::MaglevHash"],
  [() => m9.Record, "SolidCache::Record"],
  [() => m10.Store, "SolidCache::Store"],
  [() => m11.Api, "SolidCache::Store::Api"],
  [() => m12.Connections, "SolidCache::Store::Connections"],
  [() => m13.Entries, "SolidCache::Store::Entries"],
  [() => m14.Failsafe, "SolidCache::Store::Failsafe"],
]);
