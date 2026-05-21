import { describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { NullLogger, nullLogger } from "./null-logger.js";

describe("NullLogger", () => {
  it("is a Logger", () => {
    expect(new NullLogger()).toBeInstanceOf(Logger);
  });

  it("discards writes without throwing", () => {
    const log = nullLogger();
    expect(() => {
      log.info("hello");
      log.warn("world");
      log.error("boom");
      log.append("raw");
      log.close();
    }).not.toThrow();
  });

  it("still honors level filtering", () => {
    const log = nullLogger();
    log.level = Logger.WARN;
    expect(log.warnEnabled).toBe(true);
    expect(log.debugEnabled).toBe(false);
  });

  it("short-circuits add/log without invoking the formatter", () => {
    const log = nullLogger();
    let formatterCalls = 0;
    log.formatter = () => {
      formatterCalls += 1;
      return "";
    };
    log.info("hot path");
    log.add(Logger.ERROR, "boom");
    expect(formatterCalls).toBe(0);
  });
});
