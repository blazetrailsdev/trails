import { ConfigurationError } from "./errors.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
import type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";
import type { QueryTransformer } from "./query-transformers.js";

export { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
export type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";

export type TagHandler = (context?: Record<string, TagValue>) => TagValue;
export type TagDefinition = string | TagHandler | Record<string, TagValue | TagHandler>;

export class GetKeyHandler {
  constructor(private readonly name: string) {}

  call(context: Record<string, TagValue>): TagValue {
    return context[this.name];
  }
}

export class QueryLogs implements QueryTransformer {
  private _tags: TagDefinition[] = [];
  private _tagsFormatter: "legacy" | "sqlcommenter" = "legacy";
  private _formatter: QueryLogsFormatter = LegacyFormatter;
  private _prependComment = false;
  private _cacheEnabled = false;
  private _cachedComment: string | null | undefined = undefined;
  private _context: Record<string, TagValue> = {};
  private _keyHandlers: Map<string, GetKeyHandler> = new Map();

  get tags(): TagDefinition[] {
    return this._tags;
  }

  get tagsFormatter(): "legacy" | "sqlcommenter" {
    return this._tagsFormatter;
  }

  set tags(tags: TagDefinition[]) {
    this._tags = tags;
    this._keyHandlers = new Map<string, GetKeyHandler>();
    for (const tag of tags) {
      if (typeof tag === "string") {
        this._keyHandlers.set(tag, new GetKeyHandler(tag));
      }
    }
    this._cachedComment = undefined;
  }

  set taggings(tags: TagDefinition[]) {
    this.tags = tags;
  }

  get prependComment(): boolean {
    return this._prependComment;
  }

  set prependComment(value: boolean) {
    this._prependComment = value;
  }

  get cacheQueryLogTags(): boolean {
    return this._cacheEnabled;
  }

  set cacheQueryLogTags(value: boolean) {
    this._cacheEnabled = value;
    if (!value) this._cachedComment = undefined;
  }

  set formatter(format: "legacy" | "sqlcommenter" | QueryLogsFormatter) {
    if (format === "legacy") {
      this._tagsFormatter = "legacy";
      this._formatter = LegacyFormatter;
    } else if (format === "sqlcommenter") {
      this._tagsFormatter = "sqlcommenter";
      this._formatter = SQLCommenter;
    } else if (
      format !== null &&
      (typeof format === "object" || typeof format === "function") &&
      typeof format.format === "function" &&
      typeof format.join === "function"
    ) {
      if (format === SQLCommenter) {
        this._tagsFormatter = "sqlcommenter";
      } else if (format === LegacyFormatter) {
        this._tagsFormatter = "legacy";
      } else {
        this._tagsFormatter = "legacy";
      }
      this._formatter = format;
    } else {
      const describe = (v: unknown): string => {
        if (v === null) return "null";
        if (v === undefined) return "undefined";
        if (typeof v === "function") return `class/function ${v.name || "<anonymous>"}`;
        if (typeof v === "object") {
          const name = (v as { constructor?: { name?: string } })?.constructor?.name;
          return `${typeof v}${name ? ` (${name})` : ""}`;
        }
        return `${typeof v} ${String(v)}`;
      };
      throw new ConfigurationError(
        `Formatter is unsupported: ${describe(format)} — expected "legacy", "sqlcommenter", or an object/class with callable \`format\` and \`join\``,
      );
    }
    this._cachedComment = undefined;
  }

  updateContext(ctx: Record<string, TagValue>): void {
    this._context = { ...this._context, ...ctx };
    this._cachedComment = undefined;
  }

  clearContext(): void {
    this._context = {};
    this._cachedComment = undefined;
  }

  call(sql: string, connection?: unknown): string {
    const comment = this.comment(connection);
    if (!comment) return sql;
    return this._prependComment ? `${comment} ${sql}` : `${sql} ${comment}`;
  }

  clearCache(): void {
    this._cachedComment = undefined;
  }

  querySourceLocation(): string | null {
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

  /** @internal */
  tagContent(connection?: unknown): string | null {
    const context: Record<string, TagValue> = { ...this._context };
    if (connection !== undefined && context.connection == null) {
      (context as Record<string, unknown>).connection = connection;
    }
    const entries: [string, TagValue][] = [];
    for (const tag of this._tags) {
      if (typeof tag === "string") {
        let handler = this._keyHandlers.get(tag);
        if (!handler) {
          handler = new GetKeyHandler(tag);
          this._keyHandlers.set(tag, handler);
        }
        const value = handler.call(context);
        if (value != null) {
          entries.push([tag, value]);
        }
      } else if (typeof tag === "function") {
        const value = tag(context);
        if (value != null) {
          entries.push(["custom", value]);
        }
      } else if (typeof tag === "object") {
        for (const [key, handler] of Object.entries(tag)) {
          const value = typeof handler === "function" ? handler(context) : handler;
          if (value != null) {
            entries.push([key, value]);
          }
        }
      }
    }
    if (entries.length === 0) return null;
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const pairs = entries.map(([key, val]) => this._formatter.format(key, val));
    return this._formatter.join(pairs);
  }

  /** @internal */
  comment(connection?: unknown): string | null {
    if (this._cacheEnabled && this._cachedComment !== undefined) {
      return this._cachedComment;
    }
    const result = this.uncachedComment(connection);
    if (this._cacheEnabled) {
      this._cachedComment = result;
    }
    return result;
  }

  private uncachedComment(connection?: unknown): string | null {
    const content = this.tagContent(connection);
    if (!content) return null;
    return `/*${this.escapeSqlComment(content)}*/`;
  }

  private escapeSqlComment(content: string): string {
    return escapeComment(content);
  }
}

export function escapeComment(content: string): string {
  return String(content)
    .replace(/^\s*\/\*\+?\s?|\s?\*\/\s*$/g, "")
    .replace(/\*\//g, "* /")
    .replace(/\/\*/g, "/ *");
}

/** @internal */
export function rebuildHandlers(
  tags: TagDefinition[],
): [string, (ctx: Record<string, TagValue>) => TagValue][] {
  const handlers: [string, (ctx: Record<string, TagValue>) => TagValue][] = [];
  for (const i of tags) {
    if (typeof i === "function") {
      const fn = i;
      handlers.push(["custom", (ctx) => fn(ctx)]);
    } else if (typeof i === "object" && i !== null) {
      for (const [k, v] of Object.entries(i)) {
        handlers.push([k, buildHandler(k, v)]);
      }
    } else {
      handlers.push([i, buildHandler(i)]);
    }
  }
  handlers.sort((a, b) => a[0].localeCompare(b[0]));
  return handlers;
}

/** @internal */
export function buildHandler(
  name: string,
  handler?: TagValue | TagHandler,
): (ctx: Record<string, TagValue>) => TagValue {
  if (handler == null) {
    const h = new GetKeyHandler(name);
    return (ctx) => h.call(ctx);
  }
  if (typeof handler === "function") {
    if (handler.length === 0) {
      const fn = handler as () => TagValue;
      return () => fn();
    }
    return handler as (ctx: Record<string, TagValue>) => TagValue;
  }
  const val = handler;
  return () => val;
}
