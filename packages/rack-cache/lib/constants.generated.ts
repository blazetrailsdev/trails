import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./cache-control.js";
import * as m1 from "./cache.js";
import * as m2 from "./entity-store.js";
import * as m3 from "./key.js";
import * as m4 from "./request.js";
import * as m5 from "./response.js";

defineConstants([
  [m1, null, "Rack::Cache"],
  [m0, "CacheControl", "Rack::Cache::CacheControl"],
  [m2, "EntityStore", "Rack::Cache::EntityStore"],
  [m2, "Heap", "Rack::Cache::EntityStore::Heap"],
  [m2, "Noop", "Rack::Cache::EntityStore::Noop"],
  [m3, "Key", "Rack::Cache::Key"],
  [m4, "Request", "Rack::Cache::Request"],
  [m5, "Response", "Rack::Cache::Response"],
]);
