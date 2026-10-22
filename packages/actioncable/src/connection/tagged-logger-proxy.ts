import {
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
  private logger: SeverityLogger;
  #tags: unknown[];

  get tags(): unknown[] {
    return this.#tags;
  }

  constructor(logger: unknown, { tags }: { tags: unknown[] }) {
    this.logger = logger as SeverityLogger;
    this.#tags = flatten(tags);
  }

  addTags(...tags: unknown[]): unknown[] {
    this.#tags = [...this.tags, ...flatten(tags)];
    return (this.#tags = uniq(this.tags));
  }

  tag<T>(logger: unknown, block: () => T): T {
    if (rbObjRespondTo(logger, "tagged")) {
      const currentTags = this.tags.filter(
        (tag) => !(logger as TaggableLogger).formatter.currentTags.includes(tag),
      );
      return (logger as TaggableLogger).tagged(...currentTags, block) as T;
    } else {
      return block();
    }
  }

  /** @internal */
  private log(type: Severity, message: unknown, block?: () => unknown): unknown {
    return this.tag(this.logger, () => this.logger[type](message, block));
  }
}

for (const severity of ["debug", "info", "warn", "error", "fatal", "unknown"] as const) {
  rbModDefineMethod(
    TaggedLoggerProxy,
    severity,
    function (this: TaggedLoggerProxy, message: unknown = null, block?: () => unknown) {
      return (this as unknown as { log: TaggedLoggerProxy["log"] }).log(severity, message, block);
    },
  );
}

rbModConstSet(Connection, "TaggedLoggerProxy", TaggedLoggerProxy);
