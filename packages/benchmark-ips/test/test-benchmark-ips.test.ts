import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stderr as $stderr, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Benchmark } from "../lib/ips.js";

function sleep(seconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

describe("TestBenchmarkIPS", () => {
  let out: string;
  let err: string;
  let writes: [typeof $stdout.write, typeof $stderr.write];

  beforeEach(() => {
    out = "";
    err = "";
    writes = [$stdout.write, $stderr.write];
    $stdout.write = (chunk: string) => ((out += chunk), true);
    $stderr.write = (chunk: string) => ((err += chunk), true);
  });

  afterEach(() => {
    [$stdout.write, $stderr.write] = writes;
  });

  it("kwargs", () => {
    Benchmark.ips({ time: 0.001, warmup: 0.001, quiet: false }, (x) => {
      x.report("sleep 0.25", () => sleep(0.25));
    });

    expect(out.length > 0).toBeTruthy();
  });

  it("warmup0", () => {
    Benchmark.ips({ time: 0.001, warmup: 0, quiet: false }, (x) => {
      x.report("sleep 0.25", () => sleep(0.25));
    });

    expect(out).not.toMatch(/Warming up -+/);
    expect(err).toBeEmpty();
  });

  it("output", () => {
    Benchmark.ips(1, (x) => {
      x.warmup = 0;
      x.time = 0.1;
      x.report("operation", () => 100 * 100);
    });

    expect(out.length > 0).toBeTruthy();
  });

  it("quiet", () => {
    Benchmark.ips(null, null, true, (x) => {
      x.config({ warmup: 0.001, time: 0.001 });
      x.report("operation", () => 100 * 100);
    });

    expect(out.length === 0).toBeTruthy();

    Benchmark.ips({ quiet: true }, (x) => {
      x.config({ warmup: 0.001, time: 0.001 });
      x.report("operation", () => 100 * 100);
    });

    expect(out.length === 0).toBeTruthy();

    Benchmark.ips((x) => {
      x.config({ warmup: 0.001, time: 0.001 });
      x.quiet = true;
      x.report("operation", () => 100 * 100);
    });

    expect(out.length === 0).toBeTruthy();
  });

  it("quiet option override", () => {
    Benchmark.ips({ quiet: true }, (x) => {
      x.config({ warmup: 0.001, time: 0.001 });
      x.quiet = false;
      x.report("operation", () => 100 * 100);
    });

    expect(out.length > 0).toBeTruthy();
    out = "";

    Benchmark.ips({ quiet: true }, (x) => {
      x.config({ quiet: false, warmup: 0.001, time: 0.001 });
      x.report("operation", () => 100 * 100);
    });

    expect(out.length > 0).toBeTruthy();
    out = "";

    Benchmark.ips({ quiet: true, warmup: 0.001, time: 0.001 }, (x) => {
      x.config({});
      x.report("operation", () => 100 * 100);
    });

    expect(out.length === 0).toBeTruthy();
  });

  it("ips old config", () => {
    Benchmark.ips(1, 1, (x) => {
      expect(x.time).toBe(1);
      expect(x.warmup).toBe(1);
    });
  });

  it("ips default data", () => {
    const report = Benchmark.ips((x) => {
      x.config({ warmup: 0.001, time: 0.001 });
      x.report("sleep 0.25", () => sleep(0.25));
    });

    const allData = report.data();

    expect(allData).toBeTruthy();
    expect(allData[0]["name"]).toBe("sleep 0.25");
    expect(allData[0]["ips"]).toBeTruthy();
    expect(allData[0]["stddev"] != null).toBeTruthy();
  });

  it("ips empty", () => {
    const report = Benchmark.ips((x) => {
      x.config({ warmup: 0.001, time: 0.001 });
    });

    const allData = report.data();

    expect(allData).toBeTruthy();
    expect(allData).toEqual([]);
  });

  it("small warmup and time", () => {
    let report = Benchmark.ips((x) => {
      x.config({ warmup: 0.0000000001, time: 0.001 });
      x.report("addition", () => 1 + 2);
    });
    expect(report.entries[0].iterations).toBeGreaterThanOrEqual(1);

    report = Benchmark.ips((x) => {
      x.config({ warmup: 0, time: 0.0000000001 });
      x.report("addition", () => 1 + 2);
    });
    expect(report.entries[0].iterations).toBe(1);

    report = Benchmark.ips((x) => {
      x.config({ warmup: 0.001, time: 0.0000000001 });
      x.report("addition", () => 1 + 2);
    });
    expect(report.entries[0].iterations).toBeGreaterThanOrEqual(1);

    report = Benchmark.ips((x) => {
      x.config({ warmup: 0.0000000001, time: 0.0000000001 });
      x.report("addition", () => 1 + 2);
    });
    expect(report.entries[0].iterations).toBeGreaterThanOrEqual(1);

    report = Benchmark.ips((x) => {
      x.config({ warmup: 0, time: 0 });
      x.report("addition", () => 1 + 2);
    });
    expect(report.entries[0].iterations).toBe(1);
  });

  it("humanize duration", () => {
    expect(Benchmark.IPS.Helpers.humanizeDuration(0.000000001)).toBe("0.00 ns");
    expect(Benchmark.IPS.Helpers.humanizeDuration(123.456789)).toBe("123.46 ns");
    expect(Benchmark.IPS.Helpers.humanizeDuration(12345.67890123)).toBe("12.35 μs");
    // eslint-disable-next-line no-loss-of-precision
    expect(Benchmark.IPS.Helpers.humanizeDuration(123456789.0123456789)).toBe("123.46 ms");
    // eslint-disable-next-line no-loss-of-precision
    expect(Benchmark.IPS.Helpers.humanizeDuration(123456789012.3456789012)).toBe("123.46 s");
  });

  it("quick", () => {
    Benchmark.ipsQuick("toUpperCase", "toLowerCase", {
      on: "Hello World!",
      warmup: 0.001,
      time: 0.001,
    });

    expect(out.length > 0).toBeTruthy();
  });
});
