import { describe, expect, it } from "vitest";
import { Benchmark } from "./benchmark.js";
import { Logger } from "./logger.js";
import { StringIO } from "./string-io.js";

describe("Logger", () => {
  it("labels an UNKNOWN entry ANY", () => {
    const io = new StringIO();
    const logger = new Logger(io, {
      formatter: (severity: string, _t: Date, _p: unknown, msg: unknown) => `${severity} ${msg}\n`,
    });
    logger.unknown("x");
    expect(io.string()).toBe("ANY x\n");
  });

  it("coerces a Symbol or String level and rejects an unknown one", () => {
    const logger = new Logger(null, { level: ":warn" });
    expect(logger.level).toBe(Logger.WARN);
    logger.level = "ERROR";
    expect(logger.level).toBe(Logger.ERROR);
    expect(() => (logger.level = ":nope")).toThrow("invalid log level: nope");
  });

  it("with_level overrides the level for the block", () => {
    const logger = new Logger(null);
    expect(logger.withLevel(":fatal", () => logger.level)).toBe(Logger.FATAL);
  });
});

describe("Benchmark.realtime", () => {
  it("answers elapsed seconds", () => {
    expect(Benchmark.realtime(() => 1)).toBeGreaterThanOrEqual(0);
  });
});
