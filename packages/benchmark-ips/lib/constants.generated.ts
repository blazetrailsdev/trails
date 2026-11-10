import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./compare.js";
import * as m1 from "./ips.js";
import * as m2 from "./ips/job.js";
import * as m3 from "./ips/job/entry.js";
import * as m4 from "./ips/job/multi-report.js";
import * as m5 from "./ips/job/stream-report.js";
import * as m6 from "./ips/report.js";
import * as m7 from "./ips/stats/sd.js";
import * as m8 from "./ips/stats/stats-metric.js";
import * as m9 from "./timing.js";

defineConstants([
  [() => m0.Compare, "Benchmark::Compare"],
  [() => m1.IPS, "Benchmark::IPS"],
  [() => m1.Helpers, "Benchmark::IPS::Helpers"],
  [() => m2.Job, "Benchmark::IPS::Job"],
  [() => m3.Entry, "Benchmark::IPS::Job::Entry"],
  [() => m4.MultiReport, "Benchmark::IPS::Job::MultiReport"],
  [() => m5.StreamReport, "Benchmark::IPS::Job::StreamReport"],
  [() => m6.Report, "Benchmark::IPS::Report"],
  [() => m6.Entry, "Benchmark::IPS::Report::Entry"],
  [() => m7.SD, "Benchmark::IPS::Stats::SD"],
  [() => m8.StatsMetric, "Benchmark::IPS::Stats::StatsMetric"],
  [() => m9.Timing, "Benchmark::Timing"],
]);
