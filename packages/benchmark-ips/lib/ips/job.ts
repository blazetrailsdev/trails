import { ArgumentError, Hash, RuntimeError, hashAref, rbFCaller } from "@blazetrails/ruby-compat";
import { Timing } from "../timing.js";
import { Entry } from "./job/entry.js";
import { MultiReport } from "./job/multi-report.js";
import { StreamReport } from "./job/stream-report.js";
import { Report } from "./report.js";
import { SD } from "./stats/sd.js";

type Suite = NonNullable<ConstructorParameters<typeof MultiReport>[0]>;

type Block = (() => unknown) | ((times: number) => unknown);

interface ConfigOptions {
  warmup?: number;
  time?: number;
  iterations?: number;
  stats?: string;
  confidence?: number;
  quiet?: boolean;
  suite?: Suite;
}

export class Job {
  static Entry = Entry;
  static get MultiReport(): typeof MultiReport {
    return MultiReport;
  }
  static get StreamReport(): typeof StreamReport {
    return StreamReport;
  }

  static readonly MICROSECONDS_PER_100MS = 100_000;
  static readonly MICROSECONDS_PER_SECOND = Timing.MICROSECONDS_PER_SECOND;
  static readonly MAX_TIME_SKEW = 0.05;
  static readonly POW_2_30 = 1 << 30;

  readonly list: Entry[];
  readonly compare: boolean;
  readonly fullReport: Report;
  readonly timing: Hash<Entry, number>;
  warmup: number;
  time: number;
  iterations: number;
  stats: string;
  confidence: number;
  private compareOrder: string;
  private out: MultiReport;

  get quiet(): boolean {
    return this.out.isQuiet();
  }

  set quiet(val: boolean) {
    if (val) {
      this.out.quietBang();
    } else {
      if (this.out.isQuiet()) this.out.append(new StreamReport());
    }
  }

  get suite(): MultiReport {
    return this.out;
  }

  set suite(suite: Suite) {
    this.out.append(suite);
  }

  constructor(opts: Record<string, unknown> = {}) {
    void opts;
    this.list = [];
    this.compare = false;
    this.compareOrder = ":fastest";

    this.timing = new Hash<Entry, number>(1);
    this.fullReport = new Report();

    this.warmup = 2;
    this.time = 5;
    this.iterations = 1;

    this.stats = ":sd";
    this.confidence = 95;

    this.out = new MultiReport(new StreamReport());
  }

  config(opts: ConfigOptions): void {
    if (opts.warmup != null) this.warmup = opts.warmup;
    if (opts.time != null) this.time = opts.time;
    if (opts.iterations != null) this.iterations = opts.iterations;
    if (opts.stats != null) this.stats = opts.stats;
    if (opts.confidence != null) this.confidence = opts.confidence;
    if ("quiet" in opts) this.quiet = opts.quiet!;
    if (opts.suite != null) this.suite = opts.suite;
  }

  isCompare(): boolean {
    return this.compare;
  }

  compareBang({ order = ":fastest" }: { order?: string } = {}): void {
    (this as { compare: boolean }).compare = true;
    this.compareOrder = order;
  }

  item(label = "", str: string | Block | null = null, blk: Block | null = null): this {
    if (typeof str === "function") [str, blk] = [null, str];
    if (blk != null && str != null) {
      throw new ArgumentError("specify a block and a str, but not both");
    }

    const action = str ?? blk;
    if (action == null) throw new ArgumentError("no block or string");

    this.list.push(new Entry(label, action));
    return this;
  }

  report(label = "", str: string | Block | null = null, blk: Block | null = null): this {
    return this.item(label, str, blk);
  }

  cyclesPer100ms(timeMsec: number, iters: number): number {
    const cycles = Math.trunc((Job.MICROSECONDS_PER_100MS / timeMsec) * iters);
    return cycles <= 0 ? 1 : cycles;
  }

  timeUs(before: number, after: number): number {
    return (after - before) * Job.MICROSECONDS_PER_SECOND;
  }

  iterationsPerSec(cycles: number, timeUs: number): number {
    return Job.MICROSECONDS_PER_SECOND * (cycles / timeUs);
  }

  run(): void {
    if (this.warmup != null && this.warmup !== 0) {
      this.out.startWarming();
      for (let n = 0; n < this.iterations; n++) {
        this.runWarmup();
      }
    }

    this.out.startRunning();

    for (let n = 0; n < this.iterations; n++) {
      this.runBenchmark();
    }

    this.out.footer();
  }

  runWarmup(): void {
    for (const item of this.list) {
      this.out.warming(item.label, this.warmup);

      Timing.cleanEnv();

      const before = Timing.now();
      let target = Timing.addSecond(before, this.warmup / 2.0);

      let cycles = 1;
      let warmupIter: number;
      let warmupTimeUs: number;
      do {
        const t0 = Timing.now();
        item.callTimes(cycles);
        const t1 = Timing.now();
        warmupIter = cycles;
        warmupTimeUs = Timing.timeUs(t0, t1);

        if (cycles >= Job.POW_2_30) break;
        cycles *= 2;
      } while (Timing.now() + warmupTimeUs * 2 < target);

      cycles = this.cyclesPer100ms(warmupTimeUs, warmupIter);
      this.timing.set(item, cycles);

      target = Timing.addSecond(before, this.warmup);
      while (Timing.now() + Job.MICROSECONDS_PER_100MS < target) {
        item.callTimes(cycles);
      }

      this.out.warmupStats(warmupTimeUs, hashAref(this.timing, item) as number);
    }
  }

  runBenchmark(): void {
    for (const item of this.list) {
      this.out.running(item.label, this.time);

      Timing.cleanEnv();

      let iter = 0;

      const measurementsUs: number[] = [];

      const cycles = hashAref(this.timing, item) as number;

      const target = Timing.addSecond(Timing.now(), this.time);

      let before: number;
      do {
        before = Timing.now();
        item.callTimes(cycles);
        const after = Timing.now();

        const iterUs = Timing.timeUs(before, after);
        if (iterUs <= 0.0) continue;

        iter += cycles;

        measurementsUs.push(iterUs);
      } while (Timing.now() < target);

      const finalTime = before;

      const measuredUs = measurementsUs.reduce((a, b) => a + b);

      const samples = measurementsUs.map((timeUs) => this.iterationsPerSec(cycles, timeUs));

      const rep = this.createReport(
        item.label,
        measuredUs,
        iter,
        this.createStats(samples),
        cycles,
      );

      if (Math.abs(finalTime - target) >= this.time * Job.MAX_TIME_SKEW) {
        rep.showTotalTimeBang();
      }

      this.out.addReport(rep, rbFCaller()[0]);
    }
  }

  createStats(samples: number[]): SD {
    switch (this.stats) {
      case ":sd":
        return new SD(samples);
      default:
        throw new RuntimeError(`unknown stats ${this.stats}`);
    }
  }

  runComparison(): void {
    if (this.isCompare()) this.fullReport.runComparison(this.compareOrder);
  }

  createReport(
    label: string,
    measuredUs: number,
    iter: number,
    samples: SD,
    cycles: number,
  ): InstanceType<typeof Report.Entry> {
    return this.fullReport.addEntry(label, measuredUs, iter, samples, cycles);
  }
}
