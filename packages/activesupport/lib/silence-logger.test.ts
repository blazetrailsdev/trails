import { describe, it } from "vitest";

import { Logger } from "./logger.js";
import { assertEmpty, assertPredicate } from "./testing/assertions.js";

describe("LoggerSilenceTest", () => {
  it("#silence silences the log", () => {
    const io: string[] = [];
    const logger = new Logger({ write: (s) => io.push(s) });
    logger.silence(Logger.ERROR, () => {
      logger.info("Foo");
    });

    assertEmpty(io.join(""));
  });

  it("#debug? is true when setting the temporary level to Logger::DEBUG", () => {
    const logger = new Logger(null);
    logger.level = Logger.INFO;

    logger.silence(Logger.DEBUG, () => {
      assertPredicate(logger, (l) => l["debug?"]);
    });

    assertPredicate(logger, (l) => l["info?"]);
  });
});
