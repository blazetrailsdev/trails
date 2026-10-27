import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cron.js";
import * as m1 from "./duration.js";
import * as m2 from "./nat.js";

registerClassPaths([
  [() => m0.Cron, "Fugit::Cron"],
  [() => m0.CronIterator, "Fugit::Cron::CronIterator"],
  [() => m0.Frequency, "Fugit::Cron::Frequency"],
  [() => m0.TimeCursor, "Fugit::Cron::TimeCursor"],
  [() => m1.Duration, "Fugit::Duration"],
  [() => m2.Slot, "Fugit::Nat::Slot"],
  [() => m2.SlotGroup, "Fugit::Nat::SlotGroup"],
]);
