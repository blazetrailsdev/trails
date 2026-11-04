import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./engine.js";
import * as m1 from "./message.js";
import * as m2 from "./record.js";
import * as m3 from "./trim-job.js";

defineConstants([
  [() => m0.Engine, "SolidCable::Engine"],
  [() => m1.Message, "SolidCable::Message"],
  [() => m2.Record, "SolidCable::Record"],
  [() => m3.TrimJob, "SolidCable::TrimJob"],
]);
