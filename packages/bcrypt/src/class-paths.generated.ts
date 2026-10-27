import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./engine.js";
import * as m1 from "./error.js";
import * as m2 from "./password.js";

registerClassPaths([
  [() => m0.Engine, "BCrypt::Engine"],
  [() => m1.Error, "BCrypt::Error"],
  [() => m1.Errors, "BCrypt::Errors"],
  [() => m1.InvalidCost, "BCrypt::Errors::InvalidCost"],
  [() => m1.InvalidHash, "BCrypt::Errors::InvalidHash"],
  [() => m1.InvalidSalt, "BCrypt::Errors::InvalidSalt"],
  [() => m1.InvalidSecret, "BCrypt::Errors::InvalidSecret"],
  [() => m2.Password, "BCrypt::Password"],
]);
