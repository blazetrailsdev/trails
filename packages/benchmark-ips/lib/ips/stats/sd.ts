import { include, type Included } from "@blazetrails/ruby-compat";
import { Timing } from "../../timing.js";
import { StatsMetric } from "./stats-metric.js";

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include StatsMetric` (`stats/sd.rb:6`); the class/interface merge is how a mixin surfaces on the type side. */
export interface SD extends Included<typeof StatsMetric> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SD {
  readonly error: number;
  readonly samples: number[];
  private mean: number;

  constructor(samples: number[]) {
    this.samples = samples;
    this.mean = Timing.mean(samples);
    this.error = Math.round(Timing.stddev(samples, this.mean));
  }

  centralTendency(): number {
    return this.mean;
  }

  slowdown(baseline: SD): [number, number | null] {
    if (baseline.centralTendency() > this.centralTendency()) {
      return [baseline.centralTendency() / this.centralTendency(), null];
    } else {
      return [this.centralTendency() / baseline.centralTendency(), null];
    }
  }

  speedup(baseline: SD): [number, number | null] {
    return baseline.slowdown(this);
  }

  footer(): string | null {
    return null;
  }
}

include(SD, StatsMetric);
