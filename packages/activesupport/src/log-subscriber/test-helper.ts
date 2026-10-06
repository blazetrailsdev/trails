import { compact, strip, toS } from "@blazetrails/ruby-compat";
import { LogSubscriber } from "../log-subscriber.js";
import { LOG_LEVELS, Logger } from "../logger.js";
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
  private _flushCount: number;
  level: number;
  private _logged: Map<string, unknown[]>;

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

  constructor(level: number = Logger.DEBUG) {
    this._flushCount = 0;
    this.level = level;
    this._logged = new Map();
  }

  get flushCount(): number {
    return this._flushCount;
  }

  methodMissing(level: string, message: unknown = null, block?: () => unknown): void {
    if (!this._logged.has(level)) this._logged.set(level, []);
    if (block) {
      this._logged.get(level)!.push(block());
    } else {
      this._logged.get(level)!.push(message);
    }
  }

  logged(level: string): string[] {
    if (!this._logged.has(level)) this._logged.set(level, []);
    return compact(this._logged.get(level)!).map((l) => strip(toS(l)));
  }

  flush(): void {
    this._flushCount += 1;
  }
}

for (const [severity, value] of Object.entries(LOG_LEVELS)) {
  const level = severity.slice(1);
  Object.defineProperty(MockLogger.prototype, level, {
    value(this: MockLogger, message: unknown = null): void {
      if (typeof message === "function") {
        this.methodMissing(level, null, message as () => unknown);
      } else {
        this.methodMissing(level, message);
      }
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(MockLogger.prototype, `${level}?`, {
    get(this: MockLogger): boolean {
      return value >= this.level;
    },
    configurable: true,
  });
}

export function wait(this: TestHelperHost): void {
  this.notifier.wait();
}

export function setLogger(logger: MockLogger | null): void {
  LogSubscriber.logger = logger as unknown as Logger | null;
}
