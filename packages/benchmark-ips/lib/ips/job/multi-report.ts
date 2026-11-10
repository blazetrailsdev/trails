import { aryDeleteIf } from "@blazetrails/ruby-compat";
import type { Report } from "../report.js";
import { StreamReport } from "./stream-report.js";

type ReportEntry = InstanceType<typeof Report.Entry>;

interface Suite {
  startWarming?(): void;
  warming(label: string, warmup: number): void;
  warmupStats(warmupTimeUs: number, timing: number): void;
  startRunning?(): void;
  running(label: string, warmup: number): void;
  addReport(item: ReportEntry, caller: string | undefined): void;
  footer?(): void;
}

export class MultiReport {
  out: Suite[];

  isEmpty(): boolean {
    return this.out.length === 0;
  }

  isQuiet(): boolean {
    return !this.out.some((rpt) => rpt instanceof StreamReport);
  }

  quietBang(): void {
    aryDeleteIf(this.out, (rpt) => rpt instanceof StreamReport);
  }

  append(report: MultiReport | Suite | Suite[] | null): void {
    if (report instanceof MultiReport) {
      this.append(report.out);
    } else if (Array.isArray(report)) {
      this.out = [...this.out, ...report];
    } else if (report != null) {
      this.out.push(report);
    }
  }

  constructor(out: MultiReport | Suite | Suite[] | null = null) {
    this.out = [];
    this.append(out);
  }

  startWarming(): void {
    for (const o of this.out) o.startWarming?.();
  }

  warming(label: string, warmup: number): void {
    for (const o of this.out) o.warming(label, warmup);
  }

  warmupStats(warmupTimeUs: number, timing: number): void {
    for (const o of this.out) o.warmupStats(warmupTimeUs, timing);
  }

  startRunning(): void {
    for (const o of this.out) o.startRunning?.();
  }

  running(label: string, warmup: number): void {
    for (const o of this.out) o.running(label, warmup);
  }

  addReport(item: ReportEntry, caller: string | undefined): void {
    for (const o of this.out) o.addReport(item, caller);
  }

  footer(): void {
    for (const o of this.out) o.footer?.();
  }
}
