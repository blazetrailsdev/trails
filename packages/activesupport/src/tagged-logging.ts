/**
 * Tagged logging primitives (TagStack, Formatter, LocalTagStorage, TaggedLogging helpers).
 * Mirrors ActiveSupport::TaggedLogging; logger-wrapping logic lives in `logger.ts` (`taggedLogging`).
 */

import { Logger, taggedLogging as _taggedLogging } from "./logger.js";
import type { TaggedLogger } from "./logger.js";

export class TagStack {
  private _tags: string[] = [];
  private _tagsString: string | null = null;

  get tags(): string[] {
    return [...this._tags];
  }

  pushTags(tags: unknown[]): string[] {
    this._tagsString = null;
    const flat = (tags as unknown[])
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

  clear(): void {
    this._tagsString = null;
    this._tags.length = 0;
  }

  formatMessage(message: string): string {
    if (this._tags.length === 0) {
      return message;
    } else if (this._tags.length === 1) {
      return `[${this._tags[0]}] ${message}`;
    } else {
      if (this._tagsString === null) {
        this._tagsString = `[${this._tags.join("] [")}] `;
      }
      return `${this._tagsString}${message}`;
    }
  }
}

export namespace Formatter {
  export function call(
    tagStack: TagStack,
    severity: string,
    _timestamp: Date,
    _progname: string | null,
    msg: string,
  ): string {
    return tagStack.formatMessage(msg);
  }

  export function tagged(tagStack: TagStack, tags: unknown[], fn: () => void): void {
    const pushed = tagStack.pushTags(tags);
    try {
      fn();
    } finally {
      tagStack.popTags(pushed.length);
    }
  }

  export function pushTags(tagStack: TagStack, tags: unknown[]): string[] {
    return tagStack.pushTags(tags);
  }

  export function popTags(tagStack: TagStack, count: number = 1): string[] {
    return tagStack.popTags(count);
  }

  export function clearTags(tagStack: TagStack): void {
    tagStack.clear();
  }

  export function currentTags(tagStack: TagStack): string[] {
    return tagStack.tags;
  }
}

export namespace LocalTagStorage {
  export function create(): { tagStack: TagStack } {
    return { tagStack: new TagStack() };
  }
}

export namespace TaggedLogging {
  export function create(logger: Logger): TaggedLogger {
    return _taggedLogging(logger);
  }

  export function logger(output: { write(s: string): void }): TaggedLogger {
    return _taggedLogging(new Logger(output));
  }
}
