import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./connections.js";
import * as m2 from "./connections/sharded.js";
import * as m3 from "./connections/single.js";
import * as m4 from "./connections/unmanaged.js";
import * as m5 from "./engine.js";
import * as m6 from "./entry.js";
import * as m7 from "./entry/encryption.js";
import * as m8 from "./entry/expiration.js";
import * as m9 from "./entry/size.js";
import * as m10 from "./entry/size/estimate.js";
import * as m11 from "./entry/size/moving-average-estimate.js";
import * as m12 from "./expiry-job.js";
import * as m13 from "./maglev-hash.js";
import * as m14 from "./record.js";
import * as m15 from "./store.js";
import * as m16 from "./store/api.js";
import * as m17 from "./store/connections.js";
import * as m18 from "./store/entries.js";
import * as m19 from "./store/execution.js";
import * as m20 from "./store/expiry.js";
import * as m21 from "./store/failsafe.js";
import * as m22 from "./store/stats.js";

defineConstants([
  [m0, "Configuration", "SolidCache::Configuration"],
  [m1, "Connections", "SolidCache::Connections"],
  [m2, "Sharded", "SolidCache::Connections::Sharded"],
  [m3, "Single", "SolidCache::Connections::Single"],
  [m4, "Unmanaged", "SolidCache::Connections::Unmanaged"],
  [m5, "Engine", "SolidCache::Engine"],
  [m6, "Entry", "SolidCache::Entry"],
  [m7, "Encryption", "SolidCache::Entry::Encryption"],
  [m8, "Expiration", "SolidCache::Entry::Expiration"],
  [m8, "ClassMethods", "SolidCache::Entry::Expiration::ClassMethods"],
  [m9, "Size", "SolidCache::Entry::Size"],
  [m9, "ClassMethods", "SolidCache::Entry::Size::ClassMethods"],
  [m10, "Estimate", "SolidCache::Entry::Size::Estimate"],
  [m11, "MovingAverageEstimate", "SolidCache::Entry::Size::MovingAverageEstimate"],
  [m12, "ExpiryJob", "SolidCache::ExpiryJob"],
  [m13, "MaglevHash", "SolidCache::MaglevHash"],
  [m13, "Preferences", "SolidCache::MaglevHash::Preferences"],
  [m14, "Record", "SolidCache::Record"],
  [m15, "Store", "SolidCache::Store"],
  [m16, "Api", "SolidCache::Store::Api"],
  [m17, "Connections", "SolidCache::Store::Connections"],
  [m18, "Entries", "SolidCache::Store::Entries"],
  [m19, "Execution", "SolidCache::Store::Execution"],
  [m20, "Expiry", "SolidCache::Store::Expiry"],
  [m21, "Failsafe", "SolidCache::Store::Failsafe"],
  [m22, "Stats", "SolidCache::Store::Stats"],
]);
