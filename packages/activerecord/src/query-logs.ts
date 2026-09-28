import {
  ArgumentError,
  ExecutionContext,
  isBlank,
  isPresent,
  threadMattrAccessor,
} from "@blazetrails/activesupport";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
import type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";

export { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
export type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";

export type TagHandler = (context?: Record<string, TagValue>) => TagValue;
export type TagDefinition = string | Record<string, TagValue | TagHandler>;

export class GetKeyHandler {
  #name: string;

  constructor(name: string) {
    this.#name = name;
  }

  call(context: Record<string, TagValue>): TagValue {
    return context[this.#name];
  }
}

export class IdentityHandler {
  #value: TagValue;

  constructor(value: TagValue) {
    this.#value = value;
  }

  call(_context: Record<string, TagValue>): TagValue {
    return this.#value;
  }
}

export class ZeroArityHandler {
  #proc: () => TagValue;

  constructor(proc: () => TagValue) {
    this.#proc = proc;
  }

  call(_context: Record<string, TagValue>): TagValue {
    return this.#proc();
  }
}

type Handler = GetKeyHandler | IdentityHandler | ZeroArityHandler | TagHandler;

export class QueryLogs {
  static #taggings: Record<string, TagValue | TagHandler> = Object.freeze({});
  static #tags: TagDefinition[] = Object.freeze(["application"]) as TagDefinition[];
  static prependComment = false;
  static cacheQueryLogTags = false;
  static #tagsFormatter: string | false = false;
  static #formatter: QueryLogsFormatter;
  static #handlers: [string, Handler][];
  declare static cachedComment: string | null;

  static {
    threadMattrAccessor.call(this, "cachedComment", { instanceAccessor: false });
  }

  static get tags(): TagDefinition[] {
    return this.#tags;
  }

  static get taggings(): Record<string, TagValue | TagHandler> {
    return this.#taggings;
  }

  static get tagsFormatter(): string | false {
    return this.#tagsFormatter;
  }

  static set taggings(taggings: Record<string, TagValue | TagHandler>) {
    this.#taggings = Object.freeze(taggings);
    this.#handlers = this.rebuildHandlers();
  }

  static set tags(tags: TagDefinition[]) {
    this.#tags = Object.freeze(tags) as TagDefinition[];
    this.#handlers = this.rebuildHandlers();
  }

  static set tagsFormatter(format: string) {
    switch (format) {
      case "legacy":
        this.#formatter = LegacyFormatter;
        break;
      case "sqlcommenter":
        this.#formatter = SQLCommenter;
        break;
      default:
        throw new ArgumentError(`Formatter is unsupported: ${format}`);
    }
    this.#tagsFormatter = format;
  }

  static call(sql: string, connection?: unknown): string {
    const comment = this.comment(connection);

    if (isBlank(comment)) {
      return sql;
    } else if (this.prependComment) {
      return `${comment} ${sql}`;
    } else {
      return `${sql} ${comment}`;
    }
  }

  static clearCache(): void {
    this.cachedComment = null;
  }

  static querySourceLocation(): string | null {
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split("\n").slice(2);
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed.includes("node_modules") &&
        !trimmed.includes("query-logs") &&
        !trimmed.includes("activerecord/dist")
      ) {
        const match = trimmed.match(/at\s+(?:.*?\s+\()?(.+):(\d+):\d+\)?$/);
        if (match) return `${match[1]}:${match[2]}`;
      }
    }
    return null;
  }

  static {
    ExecutionContext.afterChange(() => QueryLogs.clearCache());
  }

  private static rebuildHandlers(): [string, Handler][] {
    const handlers: [string, Handler][] = [];
    for (const i of this.#tags) {
      if (typeof i === "object" && i !== null) {
        for (const [k, v] of Object.entries(i)) {
          handlers.push([k, this.buildHandler(k, v)]);
        }
      } else {
        handlers.push([i, this.buildHandler(i)]);
      }
    }
    return handlers.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  private static buildHandler(name: string, handler?: TagValue | TagHandler): Handler {
    if (handler == null || handler === false) handler = this.#taggings[name];
    if (handler == null) {
      return new GetKeyHandler(name);
    } else if (typeof handler === "function") {
      if (handler.length === 0) {
        return new ZeroArityHandler(handler as () => TagValue);
      } else {
        return handler;
      }
    } else {
      return new IdentityHandler(handler);
    }
  }

  /** @internal */
  static comment(connection?: unknown): string | null {
    if (this.cacheQueryLogTags) {
      return (this.cachedComment ??= this.uncachedComment(connection));
    } else {
      return this.uncachedComment(connection);
    }
  }

  private static uncachedComment(connection?: unknown): string | null {
    const content = this.tagContent(connection);

    if (isPresent(content)) {
      return `/*${this.escapeSqlComment(content)}*/`;
    }
    return null;
  }

  private static escapeSqlComment(content: string): string {
    let comment = String(content);
    comment = comment.replace(/^\s*\/\*\+?\s?|\s?\*\/\s*$/g, "");
    comment = comment.replaceAll("*/", "* /");
    comment = comment.replaceAll("/*", "/ *");
    return comment;
  }

  /** @internal */
  static tagContent(connection?: unknown): string {
    const context = ExecutionContext.toH() as Record<string, TagValue>;
    if (context.connection == null || (context.connection as unknown) === false) {
      (context as Record<string, unknown>).connection = connection;
    }

    const pairs = this.#handlers.flatMap(([key, handler]) => {
      const val = typeof handler === "function" ? handler(context) : handler.call(context);
      return val == null ? [] : [this.#formatter.format(key, val)];
    });
    return this.#formatter.join(pairs);
  }

  static {
    this.#handlers = this.rebuildHandlers();
    this.tagsFormatter = "legacy";
  }
}
