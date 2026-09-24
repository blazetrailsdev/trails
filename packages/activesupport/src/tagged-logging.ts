import { Logger, SimpleFormatter, type LoggerFormatter } from "./logger.js";
import type { Temporal } from "@blazetrails/date";
import { extend, extended, isEmpty, rbObjAsString, rbObjId } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

export interface TaggedFormatter {
  call(
    severity: string,
    timestamp: Temporal.Instant,
    progname: string | null,
    msg: unknown,
  ): string;
  tagged<T>(...tags: [...unknown[], (formatter: TaggedFormatter) => T]): T;
  pushTags(...tags: unknown[]): string[];
  popTags(count?: number): string[];
  clearTagsBang(): string[];
  tagStack: TagStack;
  readonly currentTags: string[];
  readonly tagsText: string;
  _threadKey?: string;
}

export interface TaggedLogger extends Logger {
  get formatter(): TaggedFormatter;
  set formatter(value: LoggerFormatter | null);
  tagged<T>(...tags: [...unknown[], (logger: TaggedLogger) => T]): T;
  tagged(...tags: unknown[]): TaggedLogger;
  pushTags(...tags: unknown[]): string[];
  popTags(count?: number): string[];
  clearTagsBang(): string[];
  flush(): void;
}

export class TagStack {
  private _tags: string[] = [];
  private _tagsString: string | null = null;

  get tags(): string[] {
    return [...this._tags];
  }

  pushTags(tags: unknown[]): string[] {
    this._tagsString = null;
    const flat = tags
      .flat(Infinity)
      .map((t) => (t == null ? "" : globalThis.String(t)))
      .filter((t) => t.length > 0 && !/^\s*$/.test(t));
    this._tags.push(...flat);
    return flat;
  }

  popTags(count: number = 1): string[] {
    if (count <= 0) return [];
    this._tagsString = null;
    const n = Math.min(Math.trunc(count), this._tags.length);
    if (n <= 0) return [];
    return this._tags.splice(-n, n);
  }

  clear(): string[] {
    this._tagsString = null;
    this._tags.length = 0;
    return this._tags;
  }

  /** @missingRailsName tags — PERMANENT */
  formatMessage(message: unknown): unknown {
    if (isEmpty(this._tags)) {
      return message;
    } else if (this._tags.length === 1) {
      return `[${this._tags[0]}] ${rbObjAsString(message)}`;
    } else {
      if (this._tagsString === null) {
        this._tagsString = `[${this._tags.join("] [")}] `;
      }
      return `${this._tagsString}${rbObjAsString(message)}`;
    }
  }
}

export const Formatter = {
  call(
    this: TaggedFormatter,
    severity: string,
    timestamp: Temporal.Instant,
    progname: string | null,
    msg: unknown,
  ): string {
    return (Object.getPrototypeOf(this) as TaggedFormatter).call.call(
      this,
      severity,
      timestamp,
      progname,
      this.tagStack.formatMessage(msg),
    );
  },

  tagged<T>(this: TaggedFormatter, ...tags: unknown[]): T {
    const block = tags.pop() as (formatter: TaggedFormatter) => T;
    const pushedCount = this.tagStack.pushTags(tags).length;
    try {
      return block(this);
    } finally {
      this.popTags(pushedCount);
    }
  },

  pushTags(this: TaggedFormatter, ...tags: unknown[]): string[] {
    return this.tagStack.pushTags(tags);
  },

  popTags(this: TaggedFormatter, count: number = 1): string[] {
    return this.tagStack.popTags(count);
  },

  clearTagsBang(this: TaggedFormatter): string[] {
    return this.tagStack.clear();
  },

  get tagStack(): TagStack {
    const self = this as unknown as TaggedFormatter;
    self._threadKey ??= `activesupport_tagged_logging_tags:${rbObjId(self)}`;
    return (
      IsolatedExecutionState.get<TagStack>(self._threadKey) ??
      IsolatedExecutionState.set(self._threadKey, new TagStack())
    );
  },

  get currentTags(): string[] {
    return (this as unknown as TaggedFormatter).tagStack.tags;
  },

  get tagsText(): string {
    return (this as unknown as TaggedFormatter).tagStack.formatMessage("") as string;
  },
};

export const LocalTagStorage = {
  get tagStack(): TagStack {
    return (this as unknown as { _tagStack: TagStack })._tagStack;
  },
  set tagStack(value: TagStack) {
    (this as unknown as { _tagStack: TagStack })._tagStack = value;
  },

  [extended](base: TaggedFormatter): void {
    base.tagStack = new TagStack();
  },
};

export const TaggedLogging = {
  logger(...args: ConstructorParameters<typeof Logger>): TaggedLogger {
    return TaggedLogging.new(new Logger(...args));
  },

  new(logger: Logger): TaggedLogger {
    logger =
      (logger as { dup?: () => Logger }).dup?.() ??
      (Object.assign(Object.create(Object.getPrototypeOf(logger) as object), logger) as Logger);

    if (logger.formatter) {
      const formatter = logger.formatter;
      logger.formatter =
        typeof formatter === "function"
          ? (Object.create({ call: formatter }) as TaggedFormatter)
          : (Object.create(
              Object.getPrototypeOf(formatter) as object,
              Object.getOwnPropertyDescriptors(formatter),
            ) as TaggedFormatter);
    } else {
      logger.formatter = new SimpleFormatter();
    }

    extend(logger.formatter, Formatter);
    extend(logger, TaggedLogging);
    return logger as TaggedLogger;
  },

  pushTags(this: TaggedLogger, ...tags: unknown[]): string[] {
    return this.formatter.pushTags(...tags);
  },

  popTags(this: TaggedLogger, count: number = 1): string[] {
    return this.formatter.popTags(count);
  },

  clearTagsBang(this: TaggedLogger): string[] {
    return this.formatter.clearTagsBang();
  },

  /** @missingRailsArgs extend — PERMANENT */
  tagged(this: TaggedLogger, ...tags: unknown[]): unknown {
    const block =
      typeof tags.at(-1) === "function" ? (tags.pop() as (logger: TaggedLogger) => unknown) : null;
    if (block) {
      return this.formatter.tagged(...tags, () => block(this));
    } else {
      const logger = TaggedLogging.new(this);
      extend(logger.formatter, LocalTagStorage);
      logger.pushTags(...this.formatter.currentTags, ...tags);
      return logger;
    }
  },

  flush(this: TaggedLogger): void {
    this.clearTagsBang();
    const superFlush = (Object.getPrototypeOf(this) as { flush?: () => void }).flush;
    if (superFlush) superFlush.call(this);
  },
};

Object.defineProperties(TaggedLogging, {
  logger: { enumerable: false },
  new: { enumerable: false },
});
