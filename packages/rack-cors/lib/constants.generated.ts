import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./cors.js";
import * as m1 from "./cors/resource.js";
import * as m2 from "./cors/resources.js";
import * as m3 from "./cors/resources/cors-misconfiguration-error.js";
import * as m4 from "./cors/result.js";

defineConstants([
  [() => m0.Cors, "Rack::Cors"],
  [() => m1.Resource, "Rack::Cors::Resource"],
  [() => m3.CorsMisconfigurationError, "Rack::Cors::Resource::CorsMisconfigurationError"],
  [() => m2.Resources, "Rack::Cors::Resources"],
  [() => m4.Result, "Rack::Cors::Result"],
]);
