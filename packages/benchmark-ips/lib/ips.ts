import {
  Kernel,
  TopLevel,
  classModule,
  constSet,
  extend,
  format,
  rbFSend,
} from "@blazetrails/ruby-compat";
import { Compare } from "./compare.js";
import { Job } from "./ips/job.js";
import { Report } from "./ips/report.js";
import { SD } from "./ips/stats/sd.js";
import { StatsMetric } from "./ips/stats/stats-metric.js";
import { Timing } from "./timing.js";

type IpsOptions = { time?: number | null; warmup?: number | null; quiet?: boolean | null };

const SUFFIXES = Object.freeze(["", "k", "M", "B", "T", "Q"]);

export const Helpers = {
  SUFFIXES,

  scale(value: number): string {
    let scale = Math.trunc(Math.log10(value) / 3);
    if (scale < 0 || scale >= SUFFIXES.length) scale = 0;
    const suffix = SUFFIXES[scale];
    const scaledValue = value / 1000 ** scale;

    return format(`%10.3f${suffix}`, scaledValue);
  },

  humanizeDuration(durationNs: number): string {
    if (durationNs < 1000) {
      return format("%.2f ns", durationNs);
    } else if (durationNs < 1_000_000) {
      return format("%.2f μs", durationNs / 1000);
    } else if (durationNs < 1_000_000_000) {
      return format("%.2f ms", durationNs / 1_000_000);
    } else {
      return format("%.2f s", durationNs / 1_000_000_000);
    }
  },
};

/**
 * @missingRailsCall loadHeldResults — CONVERGEABLE benchmark-ips-held-results-json-and-share
 * @missingRailsCall saveHeldResults — CONVERGEABLE benchmark-ips-held-results-json-and-share
 * @missingRailsCall clearHeldResults — CONVERGEABLE benchmark-ips-held-results-json-and-share
 * @missingRailsCall generateJson — CONVERGEABLE benchmark-ips-held-results-json-and-share
 */
export class IPS {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static readonly VERSION = "2.14.0";
  static readonly CODENAME = "Akagi";
  static Helpers = Helpers;
  static get Job(): typeof Job {
    return Job;
  }
  static get Report(): typeof Report {
    return Report;
  }
  static Stats = { SD, StatsMetric };

  ips(
    ...args: [...(IpsOptions | number | boolean | null | undefined)[], (job: Job) => unknown]
  ): Report {
    const block = args.pop() as (job: Job) => unknown;
    let time, warmup, quiet;
    if (args[0] != null && typeof args[0] === "object") {
      ({ time, warmup, quiet } = args[0]);
    } else {
      [time, warmup, quiet] = args as unknown as [number?, number?, boolean?];
    }

    const job = new Job();

    const jobOpts: IpsOptions = {};
    if (time != null) jobOpts.time = time;
    if (warmup != null) jobOpts.warmup = warmup;
    if (quiet != null) jobOpts.quiet = quiet;

    job.config(jobOpts as Parameters<Job["config"]>[0]);

    block(job);

    job.run();

    job.runComparison();

    const report = job.fullReport;

    return report;
  }

  ipsQuick(
    ...args: [...string[], { on?: unknown; warmup?: number; time?: number }] | string[]
  ): Report {
    const last = args.at(-1);
    const { on = Kernel, ...opts } =
      typeof last === "object" ? (args.pop() as { on?: unknown }) : {};
    const methods = args as string[];
    return this.ips(opts, (x) => {
      x.compareBang();

      for (const name of methods) {
        x.report(name, null, (iter: number) => {
          for (let i = 0; i < iter; i++) rbFSend(on, name);
        });
      }
    });
  }

  private static _options: Record<string, unknown> | null = null;

  static options(): Record<string, unknown> {
    return (IPS._options ??= { format: ":human" });
  }
}

export const Benchmark = extend({ IPS, Compare, Timing }, IPS, Compare) as {
  IPS: typeof IPS;
  Compare: typeof Compare;
  Timing: typeof Timing;
} & Pick<IPS, "ips" | "ipsQuick"> &
  typeof Compare;

constSet(TopLevel, "Benchmark", Benchmark);

import "./constants.generated.js";
