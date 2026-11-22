import { env as ENV, Logger, STDERR, warn } from "@blazetrails/ruby-compat";

type AdapterWarnBehavior = string | false | null | ((message: string) => unknown);

let _logger: Logger | null = null;

export const Listen = {
  adapterWarnBehavior: "warn" as AdapterWarnBehavior,

  get logger(): Logger {
    return (_logger ??= Listen.defaultLogger());
  },

  set logger(logger: Logger | null) {
    _logger = logger;
  },

  adapterWarn(message: string): void {
    switch (
      ENV["LISTEN_GEM_ADAPTER_WARN_BEHAVIOR"] ??
      Listen.adapterWarnBehaviorCallback(message)
    ) {
      case "log":
        Listen.logger.warn(message);
        break;
      case "silent":
      case null:
      case undefined:
      case false:
        break;
      default:
        warn(message);
    }
  },

  /** @internal */
  defaultLogger(): Logger {
    const debugging = ENV["LISTEN_GEM_DEBUGGING"] ?? "";
    let level: number;
    if (/debug|2/i.test(debugging)) {
      level = Logger.DEBUG;
    } else if (/info|true|yes|1/i.test(debugging)) {
      level = Logger.INFO;
    } else if (/warn/i.test(debugging)) {
      level = Logger.WARN;
    } else if (/fatal/i.test(debugging)) {
      level = Logger.FATAL;
    } else {
      level = Logger.ERROR;
    }

    return new Logger(STDERR, { level });
  },

  /** @internal */
  adapterWarnBehaviorCallback(message: string): unknown {
    const adapterWarnBehavior = Listen.adapterWarnBehavior;
    if (typeof adapterWarnBehavior === "function") {
      const behavior = adapterWarnBehavior(message);
      if (typeof behavior === "string") {
        return behavior;
      } else if (behavior === false || behavior == null) {
        return "silent";
      } else {
        return "warn";
      }
    } else {
      return adapterWarnBehavior;
    }
  },
};
