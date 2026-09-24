import { describe, it, expect, afterEach } from "vitest";
import { LogSubscriber } from "./log-subscriber.js";
import { TopLevel } from "./namespaces.js";
import type { Logger } from "./logger.js";

describe("LogSubscriber.logger fallback", () => {
  afterEach(() => {
    LogSubscriber.logger = null;
    delete TopLevel.Trails;
  });

  it("falls back to Trails.logger when nothing has been assigned", () => {
    const appLogger = { warn() {}, debug() {} };
    TopLevel.Trails = { logger: appLogger } as never;
    expect(LogSubscriber.logger).toBe(appLogger);
  });

  it("answers null while there is no application logger", () => {
    expect(LogSubscriber.logger).toBeNull();
  });

  it("lets an explicit assignment win over the fallback", () => {
    const appLogger = { warn() {}, debug() {} };
    const own = { warn() {}, debug() {} } as unknown as Logger;
    TopLevel.Trails = { logger: appLogger } as never;
    LogSubscriber.logger = own;
    expect(LogSubscriber.logger).toBe(own);
  });

  it("memoizes with Rails' `||=`, so a later Trails.logger does not retroactively win", () => {
    const first = { warn() {}, debug() {} };
    TopLevel.Trails = { logger: first } as never;
    expect(LogSubscriber.logger).toBe(first);

    TopLevel.Trails = { logger: { warn() {}, debug() {} } } as never;
    expect(LogSubscriber.logger).toBe(first);
  });
});
