import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stdout as $stdout } from "@blazetrails/ruby-compat";
import { Benchmark } from "../lib/ips.js";

describe("benchmark-ips", () => {
  let out: string;
  let write: typeof $stdout.write;

  beforeEach(() => {
    out = "";
    write = $stdout.write;
    $stdout.write = (chunk: string) => ((out += chunk), true);
  });

  afterEach(() => {
    $stdout.write = write;
  });

  it("runs the script trails generate benchmark emits", () => {
    const report = Benchmark.ips((x) => {
      x.config({ warmup: 0.001, time: 0.01 });
      x.report("before", () => {});
      x.report("after", () => {});

      x.compareBang();
    });

    expect(report.entries.map((e) => e.label)).toEqual(["before", "after"]);
    expect(out).toMatch(/Calculating -+/);
    expect(out).toMatch(/\nComparison:\n/);
    expect(out).toMatch(/ +(before|after): +[\d.]+ i\/s\n/);
  });
});
