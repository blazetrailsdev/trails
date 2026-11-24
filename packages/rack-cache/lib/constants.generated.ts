import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./cache-control.js";
import * as m1 from "./cache.js";
import * as m2 from "./context.js";
import * as m3 from "./entity-store.js";
import * as m4 from "./key.js";
import * as m5 from "./meta-store.js";
import * as m6 from "./options.js";
import * as m7 from "./request.js";
import * as m8 from "./response.js";
import * as m9 from "./storage.js";

defineConstants([
  [() => m1, null, "Rack::Cache"],
  [() => m0, "CacheControl", "Rack::Cache::CacheControl"],
  [() => m2, "Context", "Rack::Cache::Context"],
  [() => m3, "EntityStore", "Rack::Cache::EntityStore"],
  [() => m3, "Dalli", "Rack::Cache::EntityStore::Dalli"],
  [() => m3, "Disk", "Rack::Cache::EntityStore::Disk"],
  [() => m3, "Body", "Rack::Cache::EntityStore::Disk::Body"],
  [() => m3, "Heap", "Rack::Cache::EntityStore::Heap"],
  [() => m3, "MemCacheBase", "Rack::Cache::EntityStore::MemCacheBase"],
  [() => m3, "Noop", "Rack::Cache::EntityStore::Noop"],
  [() => m4, "Key", "Rack::Cache::Key"],
  [() => m5, "MetaStore", "Rack::Cache::MetaStore"],
  [() => m5, "Dalli", "Rack::Cache::MetaStore::Dalli"],
  [() => m5, "Disk", "Rack::Cache::MetaStore::Disk"],
  [() => m5, "Heap", "Rack::Cache::MetaStore::Heap"],
  [() => m5, "MemCacheBase", "Rack::Cache::MetaStore::MemCacheBase"],
  [() => m6, "Options", "Rack::Cache::Options"],
  [() => m7, "Request", "Rack::Cache::Request"],
  [() => m8, "Response", "Rack::Cache::Response"],
  [() => m9, "Storage", "Rack::Cache::Storage"],
]);
