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
  [() => m1.Cookie.Base64, "Rack::Session::Cookie::Base64"],
  [() => m1.Cookie.Base64.JSON, "Rack::Session::Cookie::Base64::JSON"],
  [() => m1.Cookie.Base64.ZipJSON, "Rack::Session::Cookie::Base64::ZipJSON"],
  [() => m1.Cookie.Identity, "Rack::Session::Cookie::Identity"],
  [() => m1.Cookie.SessionId, "Rack::Session::Cookie::SessionId"],
  [() => m2.Encryptor, "Rack::Session::Encryptor"],
  [() => m2.Encryptor.Error, "Rack::Session::Encryptor::Error"],
  [() => m2.Encryptor.InvalidMessage, "Rack::Session::Encryptor::InvalidMessage"],
  [() => m2.Encryptor.InvalidSignature, "Rack::Session::Encryptor::InvalidSignature"],
  [() => m3.Pool, "Rack::Session::Pool"],
  [() => m0.SessionId, "Rack::Session::SessionId"],
]);
