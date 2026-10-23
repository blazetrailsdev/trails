import { lookupStore } from "@blazetrails/activesupport/cache";
import { silenceWarnings } from "@blazetrails/activesupport/core-ext/kernel/reporting";
import {
  ActiveSupport,
  BroadcastLogger,
  Logger,
  type LoggerOutput,
  type LogLevel,
  runLoadHooks,
  TaggedLogging,
  TopLevel,
} from "@blazetrails/activesupport";
import { Runtime } from "@blazetrails/rack";
import { LoadError, rbObjRespondTo, StandardError, stderr } from "@blazetrails/ruby-compat";
import { Initializable } from "../initializable.js";

export interface BootstrapConfig {
  logger?: Logger | null;
  logLevel: LogLevel | number | string;
  logFormatter: Logger["formatter"];
  broadcastLogLevel?: LogLevel | number | string | null;
  defaultLogFile(): Promise<LoggerOutput>;
  paths(): { get(path: string): { first(): Promise<string | undefined> } | undefined };
  cacheStore?: unknown;
  activeSupport: { cacheFormatVersion?: number };
  middleware?: { insertBefore(...args: unknown[]): void };
}

export interface BootstrapHost {
  config: BootstrapConfig;
}

export abstract class Bootstrap extends Initializable implements BootstrapHost {
  abstract config: BootstrapConfig;
}

Bootstrap.initializer("load_environment_hook", { group: "all" }, function () {});

Bootstrap.initializer<BootstrapHost>("initialize_logger", { group: "all" }, async function () {
  TopLevel.Trails!.logger ??=
    this.config.logger ??
    (await (async () => {
      try {
        let logger = new Logger(await this.config.defaultLogFile());
        logger.formatter = this.config.logFormatter;
        logger = TaggedLogging.new(logger);
        return logger;
      } catch (error) {
        if (!(error instanceof StandardError)) throw error;
        const path = await this.config.paths().get("log")!.first();
        const logger = TaggedLogging.new(new Logger(stderr));
        logger.level = Logger.WARN;
        logger.warn(
          `Rails Error: Unable to access log file. Please ensure that ${path} exists and is writable ` +
            `(i.e. make it writable for user and group: chmod 0664 ${path}). ` +
            "The log level has been raised to WARN and the output directed to STDERR until the problem is fixed.",
        );
        return logger;
      }
    })());

  if (TopLevel.Trails!.logger instanceof BroadcastLogger) {
    if (this.config.broadcastLogLevel != null) {
      TopLevel.Trails!.logger.level = this.config.broadcastLogLevel;
    }
  } else {
    TopLevel.Trails!.logger.level = this.config.logLevel;
    const broadcastLogger = new BroadcastLogger(TopLevel.Trails!.logger);
    broadcastLogger.formatter = TopLevel.Trails!.logger.formatter;
    TopLevel.Trails!.logger = broadcastLogger;
  }
});

Bootstrap.initializer<BootstrapHost>("initialize_cache", { group: "all" }, async function () {
  if (TopLevel.ActiveSupport!.MessagePack === undefined) {
    try {
      await silenceWarnings(() =>
        TopLevel.ActiveSupport!.loadPath["active_support/message_pack"](),
      );
    } catch (error) {
      if (!(error instanceof LoadError)) throw error;
    }
  }
  const cacheFormatVersion = this.config.activeSupport.cacheFormatVersion;
  delete this.config.activeSupport.cacheFormatVersion;
  if (cacheFormatVersion != null) ActiveSupport.setCacheFormatVersion(cacheFormatVersion);

  if (TopLevel.Trails!.cache == null) {
    const cacheStore = this.config.cacheStore;
    const serializer = Array.isArray(cacheStore)
      ? (cacheStore.at(-1) as { serializer?: unknown } | null)?.serializer
      : undefined;
    if (
      typeof serializer === "string" &&
      serializer.includes("message_pack") &&
      TopLevel.ActiveSupport!.MessagePack === undefined
    ) {
      await TopLevel.ActiveSupport!.loadPath["active_support/message_pack"]();
    }
    TopLevel.Trails!.cache = lookupStore(this.config.cacheStore);

    if (rbObjRespondTo(TopLevel.Trails!.cache, "middleware")) {
      this.config.middleware!.insertBefore(
        Runtime,
        (TopLevel.Trails!.cache as unknown as { middleware: unknown }).middleware,
      );
    }
  }
});

Bootstrap.initializer<BootstrapHost>("bootstrap_hook", { group: "all" }, function () {
  runLoadHooks("before_initialize", this);
});
