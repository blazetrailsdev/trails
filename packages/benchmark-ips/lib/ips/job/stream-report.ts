import { RUBY_DESCRIPTION, format, print, puts, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Helpers, IPS } from "../../ips.js";
import type { Report } from "../report.js";

type Writable = typeof $stdout;

export class StreamReport {
  private lastItem: InstanceType<typeof Report.Entry> | null;
  private out: Writable;

  constructor(stream: Writable = $stdout) {
    this.lastItem = null;
    this.out = stream;
  }

  startWarming(): void {
    puts.call(this.out, RUBY_DESCRIPTION());
    puts.call(this.out, "Warming up --------------------------------------");
  }

  startRunning(): void {
    puts.call(this.out, "Calculating -------------------------------------");
  }

  warming(label: string, _warmup: number): void {
    print.call(this.out, this.rjust(label));
  }

  warmupStats(_warmupTimeUs: number, timing: number): void {
    switch (this.format()) {
      case ":human":
        print.call(this.out, format("%s i/100ms\n", Helpers.scale(timing)));
        break;
      default:
        print.call(this.out, format("%10d i/100ms\n", timing));
    }
  }

  running(label: string, warmup: number): void {
    this.warming(label, warmup);
  }

  addReport(item: InstanceType<typeof Report.Entry>, _caller: string | undefined): void {
    puts.call(this.out, ` ${item.body()}`);
    this.lastItem = item;
  }

  footer(): void {
    if (this.lastItem == null) return;
    const footer = this.lastItem.stats.footer();
    if (footer != null) puts.call(this.out, footer.padStart(40));
  }

  private format(): unknown {
    return IPS.options()["format"];
  }

  private rjust(label: string): string {
    label = String(label);
    if (label.length > 20) {
      return `${label}\n${" ".repeat(20)}`;
    } else {
      return label.padStart(20);
    }
  }
}
