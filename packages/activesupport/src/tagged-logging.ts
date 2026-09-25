import { Logger, SimpleFormatter, type LoggerFormatter } from "./logger.js";
import type { Temporal } from "@blazetrails/date";
import {
  aryPop,
  extend,
  extended,
  isEmpty,
  rbObjAsString,
  rbObjClone,
  rbObjId,
} from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import { isBlank } from "./core-ext/object/blank.js";

type Tag = string | number | boolean | null | undefined | readonly Tag[];

export interface TaggedFormatter {
  call(
    severity: string,
    timestamp: Temporal.Instant,
    progname: string | null,
    msg: unknown,
  ): string;
  tagged<T>(...tags: (Tag | ((formatter: TaggedFormatter) => T))[]): T;
  pushTags(...tags: unknown[]): unknown[];
  popTags(count?: number): unknown[];
  clearTagsBang(): unknown[];
  tagStack: TagStack;
  readonly currentTags: unknown[];
  readonly tagsText: string;
  _threadKey?: string;
}

export interface TaggedLogger extends Logger {
  get formatter(): TaggedFormatter;
  set formatter(value: LoggerFormatter | null);
  tagged<T>(...tags: [...Tag[], (logger: TaggedLogger) => T]): T;
  tagged(...tags: Tag[]): TaggedLogger;
  pushTags(...tags: unknown[]): unknown[];
  popTags(count?: number): unknown[];
  clearTagsBang(): unknown[];
  flush(): void;
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

  tagged<T>(this: TaggedFormatter, ...tags: (Tag | ((formatter: TaggedFormatter) => T))[]): T {
    const block = tags.pop() as (formatter: TaggedFormatter) => T;
    const pushedCount = this.tagStack.pushTags(tags).length;
    try {
      return block(this);
    } finally {
      this.popTags(pushedCount);
    }
  },

  pushTags(this: TaggedFormatter, ...tags: unknown[]): unknown[] {
    return this.tagStack.pushTags(tags);
  },

  popTags(this: TaggedFormatter, count: number = 1): unknown[] {
    return this.tagStack.popTags(count);
  },

  clearTagsBang(this: TaggedFormatter): unknown[] {
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

  get currentTags(): unknown[] {
    return (this as unknown as TaggedFormatter).tagStack.tags;
  },

  get tagsText(): string {
    return (this as unknown as TaggedFormatter).tagStack.formatMessage("") as string;
  },
};

export class TagStack {
  private _tags: unknown[] = [];
  private _tagsString: string | null = null;

  get tags(): unknown[] {
    return this._tags;
  }

  pushTags(tags: unknown[]): unknown[] {
    this._tagsString = null;
    tags.splice(0, tags.length, ...tags.flat(Infinity));
    tags.splice(0, tags.length, ...tags.filter((tag) => !isBlank(tag)));
    this._tags.push(...tags);
    return tags;
  }

  popTags(count: number): unknown[] {
    this._tagsString = null;
    return aryPop(this._tags, count);
  }

  clear(): unknown[] {
    this._tagsString = null;
    this._tags.length = 0;
    return this._tags;
  }

  /** @missingRailsName tags — PERMANENT */
  formatMessage(message: unknown): unknown {
    if (isEmpty(this._tags)) {
      return message;
    } else if (this._tags.length === 1) {
      return `[${rbObjAsString(this._tags[0])}] ${rbObjAsString(message)}`;
    } else {
      if (this._tagsString === null) {
        this._tagsString = `[${this._tags.map((tag) => rbObjAsString(tag)).join("] [")}] `;
      }
      return `${this._tagsString}${rbObjAsString(message)}`;
    }
  }
}

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
    logger = (logger as { dup?: () => Logger }).dup?.() ?? rbObjClone(logger);

    if (logger.formatter) {
      const formatter = logger.formatter;
      logger.formatter =
        typeof formatter === "function"
          ? (Object.create({ call: formatter }) as TaggedFormatter)
          : (rbObjClone(formatter) as TaggedFormatter);
    } else {
      logger.formatter = new SimpleFormatter();
    }

    extend(logger.formatter, Formatter);
    extend(logger, TaggedLogging);
    return logger as TaggedLogger;
  },

  pushTags(this: TaggedLogger, ...tags: unknown[]): unknown[] {
    return this.formatter.pushTags(...tags);
  },

  popTags(this: TaggedLogger, count: number = 1): unknown[] {
    return this.formatter.popTags(count);
  },

  clearTagsBang(this: TaggedLogger): unknown[] {
    return this.formatter.clearTagsBang();
  },

  /** @missingRailsArgs extend — PERMANENT */
  tagged(this: TaggedLogger, ...tags: (Tag | ((logger: TaggedLogger) => unknown))[]): unknown {
    const block =
      typeof tags.at(-1) === "function" ? (tags.pop() as (logger: TaggedLogger) => unknown) : null;
    if (block) {
      return this.formatter.tagged(...(tags as Tag[]), () => block(this));
    } else {
      const logger = TaggedLogging.new(this);
      extend(logger.formatter, LocalTagStorage);
      logger.pushTags(...this.formatter.currentTags, ...(tags as Tag[]));
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
