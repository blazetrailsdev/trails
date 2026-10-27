import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cookie-jar.js";
import * as m1 from "./methods.js";
import * as m2 from "./test.js";
import * as m3 from "./uploaded-file.js";
import * as m4 from "./utils.js";

registerClassPaths([
  [() => m0.Cookie, "Rack::Test::Cookie"],
  [() => m0.CookieJar, "Rack::Test::CookieJar"],
  [() => m2.Error, "Rack::Test::Error"],
  [() => m1.Methods, "Rack::Test::Methods"],
  [() => m2.Session, "Rack::Test::Session"],
  [() => m3.UploadedFile, "Rack::Test::UploadedFile"],
  [() => m4.Utils, "Rack::Test::Utils"],
]);
