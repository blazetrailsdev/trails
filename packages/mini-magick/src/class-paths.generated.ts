import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./image.js";
import * as m2 from "./image/info.js";
import * as m3 from "./shell.js";
import * as m4 from "./tool.js";
import * as m5 from "./utilities.js";
import * as m6 from "./version.js";

registerClassPaths([
  [() => m0.Configuration, "MiniMagick::Configuration"],
  [() => m1.Image, "MiniMagick::Image"],
  [() => m2.Info, "MiniMagick::Image::Info"],
  [() => m3.Shell, "MiniMagick::Shell"],
  [() => m4.Tool, "MiniMagick::Tool"],
  [() => m5.Utilities, "MiniMagick::Utilities"],
  [() => m6.VERSION, "MiniMagick::VERSION"],
]);
