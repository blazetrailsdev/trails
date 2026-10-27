import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cookie-jar.js";
import * as m1 from "./test.js";
import * as m2 from "./uploaded-file.js";

registerClassPaths([
  [() => m0.Cookie, "Rack::Test::Cookie"],
  [() => m0.CookieJar, "Rack::Test::CookieJar"],
  [() => m1.Error, "Rack::Test::Error"],
  [() => m1.Session, "Rack::Test::Session"],
  [() => m2.UploadedFile, "Rack::Test::UploadedFile"],
]);
