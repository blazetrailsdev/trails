import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./image.js";
import * as m2 from "./image/info.js";
import * as m3 from "./mini-magick.js";
import * as m4 from "./shell.js";
import * as m5 from "./tool.js";
import * as m6 from "./utilities.js";
import * as m7 from "./version.js";

defineConstants([
  [() => m0.Configuration, "MiniMagick::Configuration"],
  [() => m3.Error, "MiniMagick::Error"],
  [() => m1.Image, "MiniMagick::Image"],
  [() => m2.Info, "MiniMagick::Image::Info"],
  [() => m3.Invalid, "MiniMagick::Invalid"],
  [() => m4.Shell, "MiniMagick::Shell"],
  [() => m3.TimeoutError, "MiniMagick::TimeoutError"],
  [() => m5.Tool, "MiniMagick::Tool"],
  [() => m6.Utilities, "MiniMagick::Utilities"],
  [() => m7.VERSION, "MiniMagick::VERSION"],
]);
