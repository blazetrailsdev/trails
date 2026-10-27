import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./abstract/id.js";
import * as m1 from "./cookie.js";
import * as m2 from "./encryptor.js";
import * as m3 from "./pool.js";

registerClassPaths([
  [() => m0.ID, "Rack::Session::Abstract::ID"],
  [() => m0.Persisted, "Rack::Session::Abstract::Persisted"],
  [() => m0.PersistedSecure, "Rack::Session::Abstract::PersistedSecure"],
  [() => m0.SecureSessionHash, "Rack::Session::Abstract::PersistedSecure::SecureSessionHash"],
  [() => m0.SessionHash, "Rack::Session::Abstract::SessionHash"],
  [() => m1.Cookie, "Rack::Session::Cookie"],
  [() => m2.Encryptor, "Rack::Session::Encryptor"],
  [() => m3.Pool, "Rack::Session::Pool"],
  [() => m0.SessionId, "Rack::Session::SessionId"],
]);
