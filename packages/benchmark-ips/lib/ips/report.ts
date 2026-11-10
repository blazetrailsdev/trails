import { aryDeleteIf, format, puts, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Compare } from "../compare.js";
import type { SD } from "./stats/sd.js";
import { Helpers, IPS } from "../ips.js";

export class Entry {
  readonly label: string;
  readonly microseconds: number;
  readonly iterations: number;
  readonly stats: SD;
  readonly measurementCycle: number;
  private showTotalTime: boolean;

  constructor(label: string, us: number, iters: number, stats: SD, cycles: number) {
    this.label = label;
    this.microseconds = us;
    this.iterations = iters;
    this.stats = stats;
    this.measurementCycle = cycles;
    this.showTotalTime = false;
  }

  ips(): number {
    return this.stats.centralTendency();
  }

  ipsSd(): number {
    return this.stats.error;
  }

  samples(): number[] {
    return this.stats.samples;
  }

  showTotalTimeBang(): void {
    this.showTotalTime = true;
  }

  seconds(): number {
    return this.microseconds / 1_000_000.0;
  }

  errorPercentage(): number {
    return this.stats.errorPercentage();
  }

  runtime(): number {
    return this.seconds();
  }

  body(): string {
    const perIter = format(
      " (%s/i)",
      Helpers.humanizeDuration(1_000_000_000 / this.stats.centralTendency()),
    ).padStart(15);

    switch (IPS.options()["format"]) {
      case ":human": {
        const left = format(
          "%s (±%4.1f%%) i/s",
          Helpers.scale(this.stats.centralTendency()),
          this.stats.errorPercentage(),
        ).padEnd(20);
        const iters = Helpers.scale(this.iterations);

        if (this.showTotalTime) {
          return left + perIter + format(" - %s in %10.6fs", iters, this.runtime());
        } else {
          return left + perIter + format(" - %s", iters);
        }
      }
      default: {
        const left = format(
          "%10.1f (±%.1f%%) i/s",
          this.stats.centralTendency(),
          this.stats.errorPercentage(),
        ).padEnd(20);

        if (this.showTotalTime) {
          return left + perIter + format(" - %10d in %10.6fs", this.iterations, this.runtime());
        } else {
          return left + perIter + format(" - %10d", this.iterations);
        }
      }
    }
  }

  header(): string {
    return String(this.label).padStart(20);
  }

  toString(): string {
    return `${this.header()} ${this.body()}`;
  }

  display(): void {
    puts.call($stdout, this.toString());
  }
}

export class Report {
  static Entry = Entry;

  readonly entries: Entry[];
  private _data: Record<string, unknown>[] | null;

  constructor() {
    this.entries = [];
    this._data = null;
  }

  addEntry(
    label: string,
    microseconds: number,
    iters: number,
    stats: SD,
    measurementCycle: number,
  ): Entry {
    const entry = new Entry(label, microseconds, iters, stats, measurementCycle);
    aryDeleteIf(this.entries, (e) => e.label === label);
    this.entries.push(entry);
    return entry;
  }

  data(): Record<string, unknown>[] {
    return (this._data ??= this.entries.map((entry) => ({
      name: entry.label,
      centralTendency: entry.stats.centralTendency(),
      ips: entry.stats.centralTendency(),
      error: entry.stats.error,
      stddev: entry.stats.error,
      microseconds: entry.microseconds,
      iterations: entry.iterations,
      cycles: entry.measurementCycle,
    })));
  }

  runComparison(order: string): void {
    Compare.compare(...this.entries, { order });
  }
}
