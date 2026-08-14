import { describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";

/**
 * Rails covers `#debug!` and friends only indirectly (`broadcast_logger.rb`
 * has no test of its own for them), so their cover lives here.
 */
describe("BroadcastLogger severity setters", () => {
  const build = (): [BroadcastLogger, Logger, Logger] => {
    const log1 = new Logger({ write: () => {} });
    const log2 = new Logger({ write: () => {} });
    return [new BroadcastLogger(log1, log2), log1, log2];
  };

  it("#debug! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    log1.level = Logger.FATAL;
    log2.level = Logger.FATAL;

    logger.debugBang();

    expect(log1.level).toBe(Logger.DEBUG);
    expect(log2.level).toBe(Logger.DEBUG);
  });

  it("#info! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.infoBang();
    expect([log1.level, log2.level]).toEqual([Logger.INFO, Logger.INFO]);
  });

  it("#warn! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.warnBang();
    expect([log1.level, log2.level]).toEqual([Logger.WARN, Logger.WARN]);
  });

  it("#error! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.errorBang();
    expect([log1.level, log2.level]).toEqual([Logger.ERROR, Logger.ERROR]);
  });

  it("#fatal! sets the level on all loggers", () => {
    const [logger, log1, log2] = build();
    logger.fatalBang();
    expect([log1.level, log2.level]).toEqual([Logger.FATAL, Logger.FATAL]);
  });

  it("#sev_threshold= assigns the level to all loggers", () => {
    const [logger, log1, log2] = build();
    logger.sevThreshold = Logger.FATAL;
    expect([log1.level, log2.level]).toEqual([Logger.FATAL, Logger.FATAL]);
  });
});
