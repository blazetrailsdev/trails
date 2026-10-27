import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./at.js";
import * as m1 from "./cron.js";
import * as m2 from "./duration.js";
import * as m3 from "./nat.js";

registerClassPaths([
  [() => m0.At, "Fugit::At"],
  [() => m1.Cron, "Fugit::Cron"],
  [() => m1.CronIterator, "Fugit::Cron::CronIterator"],
  [() => m1.Frequency, "Fugit::Cron::Frequency"],
  [() => m1.Parser, "Fugit::Cron::Parser"],
  [() => m1.TimeCursor, "Fugit::Cron::TimeCursor"],
  [() => m2.Duration, "Fugit::Duration"],
  [() => m2.IsoParser, "Fugit::Duration::IsoParser"],
  [() => m2.Parser, "Fugit::Duration::Parser"],
  [() => m3.Nat, "Fugit::Nat"],
  [() => m3.Parser, "Fugit::Nat::Parser"],
  [() => m3.Slot, "Fugit::Nat::Slot"],
  [() => m3.SlotGroup, "Fugit::Nat::SlotGroup"],
]);
