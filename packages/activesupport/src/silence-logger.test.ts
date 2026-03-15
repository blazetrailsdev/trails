import { describe, expect, it } from "vitest";

import { Logger } from "./logger.js";

describe("LoggerSilenceTest", () => {
  it("#silence silences the log", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    logger.level = Logger.DEBUG;
    logger.silence(Logger.ERROR, () => {
      logger.debug("suppressed");
      logger.info("also suppressed");
      logger.error("shown");
    });
    expect(lines.some((l) => l.includes("shown"))).toBe(true);
    expect(lines.filter((l) => l.includes("suppressed")).length).toBe(0);
  });

  it("#debug? is true when setting the temporary level to Logger::DEBUG", () => {
    const logger = new Logger(null);
    logger.level = Logger.WARN;
    expect(logger.debugEnabled).toBe(false);
    logger.logAt(Logger.DEBUG, () => {
      expect(logger.debugEnabled).toBe(true);
    });
    expect(logger.debugEnabled).toBe(false);
  });
});
