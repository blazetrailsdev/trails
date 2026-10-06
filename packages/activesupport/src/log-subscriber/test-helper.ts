import { compact, Hash, strip, toS } from "@blazetrails/ruby-compat";
import { LogSubscriber } from "../log-subscriber.js";
import { LOG_LEVELS, type Logger, type LogLevel } from "../logger.js";
import { Notifications } from "../notifications.js";
import { Fanout } from "../notifications/fanout.js";

interface TestHelperHost {
  logger: MockLogger;
  notifier: Fanout;
  oldNotifier: Fanout;
  setLogger(logger: MockLogger | null): void;
}

export function setup(this: TestHelperHost): void {
  this.logger = new MockLogger();
  this.notifier = new Fanout();

  LogSubscriber.colorizeLogging = false;

  this.oldNotifier = Notifications.notifier;
  this.setLogger(this.logger);
  Notifications.notifier = this.notifier;
}

export function teardown(this: TestHelperHost): void {
  this.setLogger(null);
  Notifications.notifier = this.oldNotifier;
}

export class MockLogger {
  declare static readonly DEBUG: number;
  declare static readonly INFO: number;
  declare static readonly WARN: number;
  declare static readonly ERROR: number;
  declare static readonly FATAL: number;
  declare static readonly UNKNOWN: number;

  private _flushCount: number;
  level: number;
  private _logged: Hash<LogLevel, unknown[]>;

  declare debug: (message?: unknown) => void;
  declare info: (message?: unknown) => void;
  declare warn: (message?: unknown) => void;
  declare error: (message?: unknown) => void;
  declare fatal: (message?: unknown) => void;
  declare unknown: (message?: unknown) => void;
  declare readonly "debug?": boolean;
  declare readonly "info?": boolean;
  declare readonly "warn?": boolean;
  declare readonly "error?": boolean;
  declare readonly "fatal?": boolean;
  declare readonly "unknown?": boolean;

  constructor(level: number = MockLogger.DEBUG) {
    this._flushCount = 0;
    this.level = level;
    this._logged = new Hash<LogLevel, unknown[]>((h, k) => {
      const v: unknown[] = [];
      h.set(k, v);
      return v;
    });
  }

  get flushCount(): number {
    return this._flushCount;
  }

  methodMissing(level: LogLevel, message: unknown = null, block?: () => unknown): void {
    if (block) {
      this._logged.get(level)!.push(block());
    } else {
      this._logged.get(level)!.push(message);
    }
  }

  logged(level: LogLevel): string[] {
    return compact(this._logged.get(level)!).map((l) => strip(toS(l)));
  }

  flush(): void {
    this._flushCount += 1;
  }
}

for (const [severity, value] of Object.entries(LOG_LEVELS) as [LogLevel, number][]) {
  Object.defineProperty(MockLogger, severity.slice(1).toUpperCase(), { value });
  Object.defineProperty(MockLogger.prototype, severity.slice(1), {
    value(this: MockLogger, message: unknown = null): void {
      if (typeof message === "function") {
        this.methodMissing(severity, null, message as () => unknown);
      } else {
        this.methodMissing(severity, message);
      }
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(MockLogger.prototype, `${severity.slice(1)}?`, {
    get(this: MockLogger): boolean {
      return value >= this.level;
    },
    configurable: true,
  });
}

export function wait(this: TestHelperHost): void {
  this.notifier.wait();
}

export function setLogger(this: TestHelperHost, logger: MockLogger | null): void {
  LogSubscriber.logger = logger as unknown as Logger | null;
}

export const TestHelper = { setup, teardown, MockLogger, wait, setLogger };
