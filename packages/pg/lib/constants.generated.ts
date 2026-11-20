import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./coder.js";
import * as m1 from "./connection.js";
import * as m2 from "./exceptions.js";
import * as m3 from "./result.js";
import * as m4 from "./text-decoder/date.js";
import * as m5 from "./text-decoder/timestamp.js";

defineConstants([
  [m0, "Coder", "PG::Coder"],
  [m0, "CompositeCoder", "PG::CompositeCoder"],
  [m1, "Connection", "PG::Connection"],
  [m2, "Error", "PG::Error"],
  [m3, "Result", "PG::Result"],
  [m4, "Date", "PG::TextDecoder::Date"],
  [m5, "TimestampLocal", "PG::TextDecoder::TimestampLocal"],
  [m5, "TimestampUtc", "PG::TextDecoder::TimestampUtc"],
  [m5, "TimestampUtcToLocal", "PG::TextDecoder::TimestampUtcToLocal"],
]);
