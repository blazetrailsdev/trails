import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./gem-version.js";
import * as m1 from "./relayer.js";

defineConstants([
  [() => m1.Relayer, "ActionMailbox::Relayer"],
  [() => m1.Relayer.Result, "ActionMailbox::Relayer::Result"],
  [() => m0.VERSION, "ActionMailbox::VERSION"],
]);
