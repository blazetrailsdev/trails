import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./cache-control.js";
import * as m1 from "./cache.js";
import * as m2 from "./entity-store.js";
import * as m3 from "./key.js";
import * as m4 from "./meta-store.js";
import * as m5 from "./options.js";
import * as m6 from "./request.js";
import * as m7 from "./response.js";
import * as m8 from "./storage.js";

defineConstants([
  [m1, null, "Rack::Cache"],
  [m0, "CacheControl", "Rack::Cache::CacheControl"],
  [m2, "EntityStore", "Rack::Cache::EntityStore"],
  [m2, "Dalli", "Rack::Cache::EntityStore::Dalli"],
  [m2, "Disk", "Rack::Cache::EntityStore::Disk"],
  [m2, "Body", "Rack::Cache::EntityStore::Disk::Body"],
  [m2, "Heap", "Rack::Cache::EntityStore::Heap"],
  [m2, "MemCacheBase", "Rack::Cache::EntityStore::MemCacheBase"],
  [m2, "Noop", "Rack::Cache::EntityStore::Noop"],
  [m3, "Key", "Rack::Cache::Key"],
  [m4, "MetaStore", "Rack::Cache::MetaStore"],
  [m4, "Dalli", "Rack::Cache::MetaStore::Dalli"],
  [m4, "Disk", "Rack::Cache::MetaStore::Disk"],
  [m4, "Heap", "Rack::Cache::MetaStore::Heap"],
  [m4, "MemCacheBase", "Rack::Cache::MetaStore::MemCacheBase"],
  [m5, "Options", "Rack::Cache::Options"],
  [m6, "Request", "Rack::Cache::Request"],
  [m7, "Response", "Rack::Cache::Response"],
  [m8, "Storage", "Rack::Cache::Storage"],
]);
