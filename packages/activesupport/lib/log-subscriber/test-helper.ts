import { Hash } from "@blazetrails/ruby-compat/hash";
import { rbClearMethodCache } from "@blazetrails/ruby-compat/method-cache";
import { toS } from "@blazetrails/ruby-compat/object";
import { strip } from "@blazetrails/ruby-compat/string/method-table";
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
  /** @noRailsEquivalent PERMANENT */
  declare static readonly DEBUG: number;
  /** @noRailsEquivalent PERMANENT */
  declare static readonly INFO: number;
  /** @noRailsEquivalent PERMANENT */
  declare static readonly WARN: number;
  /** @noRailsEquivalent PERMANENT */
  declare static readonly ERROR: number;
  /** @noRailsEquivalent PERMANENT */
  declare static readonly FATAL: number;
  /** @noRailsEquivalent PERMANENT */
  declare static readonly UNKNOWN: number;

  private _flushCount: number;
  /** @internal */
  _level: unknown;
  private _logged: Hash<LogLevel, unknown[]>;

  /** @noRailsEquivalent PERMANENT */
  declare debug: (message?: unknown, block?: () => unknown) => unknown[];
  /** @noRailsEquivalent PERMANENT */
  declare info: (message?: unknown, block?: () => unknown) => unknown[];
  /** @noRailsEquivalent PERMANENT */
  declare warn: (message?: unknown, block?: () => unknown) => unknown[];
  /** @noRailsEquivalent PERMANENT */
  declare error: (message?: unknown, block?: () => unknown) => unknown[];
  /** @noRailsEquivalent PERMANENT */
  declare fatal: (message?: unknown, block?: () => unknown) => unknown[];
  /** @noRailsEquivalent PERMANENT */
  declare unknown: (message?: unknown, block?: () => unknown) => unknown[];
  declare isDebug: () => boolean;
  declare isInfo: () => boolean;
  declare isWarn: () => boolean;
  declare isError: () => boolean;
  declare isFatal: () => boolean;
  declare isUnknown: () => boolean;

  constructor(level: number = MockLogger.DEBUG) {
    this._flushCount = 0;
    this._level = level;
    this._logged = new Hash<LogLevel, unknown[]>((h, k) => {
      const v: unknown[] = [];
      h.set(k, v);
      return v;
    });
  }

  get level(): unknown {
    return this._level;
  }

  set level(value: unknown) {
    this._level = value;
  }

  get flushCount(): number {
    return this._flushCount;
  }

  methodMissing(level: LogLevel, message: unknown = null, block?: () => unknown): unknown[] {
    if (block) {
      this._logged.get(level)!.push(block());
    } else {
      this._logged.get(level)!.push(message);
    }
    return this._logged.get(level)!;
  }

  logged(level: LogLevel): string[] {
    return this._logged
      .get(level)!
      .filter((l) => l != null)
      .map((l) => strip(toS(l)));
  }

  flush(): void {
    this._flushCount += 1;
  }
}

for (const [severity, value] of Object.entries(LOG_LEVELS) as [LogLevel, number][]) {
  Object.defineProperty(MockLogger, severity.slice(1).toUpperCase(), { value });
  Object.defineProperty(MockLogger.prototype, severity.slice(1), {
    value(this: MockLogger, message: unknown = null, block?: () => unknown): unknown[] {
      return this.methodMissing(severity, message, block);
    },
    writable: true,
    configurable: true,
  });
  rbClearMethodCache();
  Object.defineProperty(
    MockLogger.prototype,
    `is${severity.slice(1, 2).toUpperCase()}${severity.slice(2)}`,
    {
      value(this: MockLogger): boolean {
        return value >= (this._level as number);
      },
      configurable: true,
    },
  );
  rbClearMethodCache();
}

export function wait(this: TestHelperHost): void {
  this.notifier.wait();
}

export function setLogger(this: TestHelperHost, logger: MockLogger | null): void {
  LogSubscriber.logger = logger as unknown as Logger | null;
}

export const TestHelper = { setup, teardown, wait, setLogger } as {
  setup: typeof setup;
  teardown: typeof teardown;
  wait: typeof wait;
  setLogger: typeof setLogger;
} & { MockLogger: typeof MockLogger };
Object.defineProperty(TestHelper, "MockLogger", { value: MockLogger });
