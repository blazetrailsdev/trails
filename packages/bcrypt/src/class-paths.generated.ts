import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./engine.js";
import * as m1 from "./error.js";
import * as m2 from "./password.js";

registerClassPaths([
  [() => m0.Engine, "BCrypt::Engine"],
  [() => m1.Error, "BCrypt::Error"],
  [() => m1.Errors, "BCrypt::Errors"],
  [() => m2.Password, "BCrypt::Password"],
]);
