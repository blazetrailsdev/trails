import {
  ARRAY_METHOD_TABLE,
  flatten,
  rbModConstSet,
  rbModDefineMethod,
  rbObjRespondTo,
  uniq,
} from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

type Severity = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

type SeverityLogger = Record<Severity, (message: unknown, block?: () => unknown) => unknown>;

interface TaggableLogger {
  formatter: { currentTags: unknown[] };
  tagged(...tags: unknown[]): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TaggedLoggerProxy {
  debug(message?: unknown, block?: () => unknown): unknown;
  info(message?: unknown, block?: () => unknown): unknown;
  warn(message?: unknown, block?: () => unknown): unknown;
  error(message?: unknown, block?: () => unknown): unknown;
  fatal(message?: unknown, block?: () => unknown): unknown;
  unknown(message?: unknown, block?: () => unknown): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TaggedLoggerProxy {
  /** @internal */
  private logger: SeverityLogger;
  private _tags: unknown[];

  get tags(): unknown[] {
    return this._tags;
  }

  constructor(logger: unknown, { tags }: { tags: unknown[] }) {
    this.logger = logger as SeverityLogger;
    this._tags = flatten(tags);
  }

  addTags(...tags: unknown[]): unknown[] {
    this._tags = [...this._tags, ...flatten(tags)];
    this._tags = uniq(this.tags);
    return this._tags;
  }

  tag<T>(logger: unknown, block: () => T): T {
    if (rbObjRespondTo(logger, "tagged")) {
      const difference = ARRAY_METHOD_TABLE.difference as (
        self: unknown[],
        ...argv: unknown[][]
      ) => unknown[];
      const currentTags = difference(this.tags, (logger as TaggableLogger).formatter.currentTags);
      return (logger as TaggableLogger).tagged(...currentTags, block) as T;
    } else {
      return block();
    }
  }

  log(type: Severity, message: unknown, block?: () => unknown): unknown {
    return this.tag(this.logger, () => this.logger[type](message, block));
  }
}

for (const severity of ["debug", "info", "warn", "error", "fatal", "unknown"] as const) {
  rbModDefineMethod(
    TaggedLoggerProxy,
    severity,
    function (this: TaggedLoggerProxy, message: unknown = null, block?: () => unknown) {
      return this.log(severity, message, block);
    },
  );
}

rbModConstSet(Connection, "TaggedLoggerProxy", TaggedLoggerProxy);
