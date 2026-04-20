/**
 * Automatically append comments to SQL queries with runtime information.
 *
 * Mirrors: ActiveRecord::QueryLogs
 *
 * Query logs add SQL comments containing contextual tags (application name,
 * controller, action, etc.) to help trace queries back to application code.
 */

import { ConfigurationError } from "./errors.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
import type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";

export { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
export type { TagValue, QueryLogsFormatter } from "./query-logs-formatter.js";

export type TagHandler = (context?: Record<string, TagValue>) => TagValue;
export type TagDefinition = string | TagHandler | Record<string, TagValue | TagHandler>;

/**
 * Handler that resolves a tag value by looking up a named key in the
 * QueryLogs context hash.
 *
 * Mirrors: ActiveRecord::QueryLogs::GetKeyHandler — Rails builds one
 * of these per string tag (`build_handler` in query_logs.rb) so
 * `[name, handler]` pairs can be uniformly dispatched via `.call`.
 */
export class GetKeyHandler {
  constructor(private readonly name: string) {}

  call(context: Record<string, TagValue>): TagValue {
    return context[this.name];
  }
}

/**
 * QueryLogs configuration and SQL comment generation.
 */
export class QueryLogs {
  private _tags: TagDefinition[] = [];
  private _formatter: QueryLogsFormatter = LegacyFormatter;
  private _prependComment = false;
  private _cacheEnabled = false;
  private _cachedComment: string | null | undefined = undefined;
  private _context: Record<string, TagValue> = {};
  // One GetKeyHandler per string tag, built when tags= is set so we
  // don't allocate one per query inside `tagContent()`. Matches
  // Rails' build_handler path (query_logs.rb:180) which builds the
  // handler list once during configuration.
  private _keyHandlers: Map<string, GetKeyHandler> = new Map();

  get tags(): TagDefinition[] {
    return this._tags;
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

  /**
   * Alias for tags setter — Rails deprecated taggings= in favor of tags=.
   * Mirrors: ActiveRecord::QueryLogs.taggings=
   */
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
      this._formatter = LegacyFormatter;
    } else if (format === "sqlcommenter") {
      this._formatter = SQLCommenter;
    } else if (
      format !== null &&
      (typeof format === "object" || typeof format === "function") &&
      typeof (format as QueryLogsFormatter).format === "function" &&
      typeof (format as QueryLogsFormatter).join === "function"
    ) {
      // Accept anything with the right call shape — an instance, a
      // const object, or a class / function with static `format` /
      // `join` (matches how Rails' singleton-class formatters are
      // invoked: `MyFormatter.format(k, v)`).
      this._formatter = format as QueryLogsFormatter;
    } else {
      // Describe the bad value without dumping a full function body
      // (classes stringify to their whole source) — prefer the
      // constructor name and type for a useful diagnostic.
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

  /**
   * Update the execution context (e.g., current controller, action).
   * Resets the cached comment.
   */
  updateContext(ctx: Record<string, TagValue>): void {
    this._context = { ...this._context, ...ctx };
    this._cachedComment = undefined;
  }

  clearContext(): void {
    this._context = {};
    this._cachedComment = undefined;
  }

  /**
   * Annotate a SQL query with comment tags.
   * Mirrors: ActiveRecord::QueryLogs.call
   */
  call(sql: string): string {
    const comment = this.comment();
    if (!comment) return sql;
    return this._prependComment ? `${comment} ${sql}` : `${sql} ${comment}`;
  }

  clearCache(): void {
    this._cachedComment = undefined;
  }

  /**
   * Return the source location of the query caller.
   * In Rails this walks the call stack to find the first non-framework
   * caller. In JS we use Error.stack parsing.
   *
   * Mirrors: ActiveRecord::QueryLogs.query_source_location
   */
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

  /**
   * Build the tag content string from current tags and context.
   * Mirrors: ActiveRecord::QueryLogs.tag_content
   */
  tagContent(): string | null {
    const pairs: string[] = [];
    for (const tag of this._tags) {
      if (typeof tag === "string") {
        // Dispatch via the pre-built GetKeyHandler (rebuilt in `tags=`),
        // matching Rails' build_handler caching. The handler is
        // guaranteed present because `tags=` populated it.
        // Prefer the pre-built handler (warm path — populated by
        // tags= setter). Fall back to a fresh one if callers mutated
        // the live _tags array without going through the setter —
        // better to pay the allocation than crash on a non-null
        // assertion.
        let handler = this._keyHandlers.get(tag);
        if (!handler) {
          handler = new GetKeyHandler(tag);
          this._keyHandlers.set(tag, handler);
        }
        const value = handler.call(this._context);
        if (value != null) {
          pairs.push(this._formatter.format(tag, value));
        }
      } else if (typeof tag === "function") {
        const value = tag(this._context);
        if (value != null) {
          pairs.push(this._formatter.format("custom", value));
        }
      } else if (typeof tag === "object") {
        for (const [key, handler] of Object.entries(tag)) {
          const value = typeof handler === "function" ? handler(this._context) : handler;
          if (value != null) {
            pairs.push(this._formatter.format(key, value));
          }
        }
      }
    }
    if (pairs.length === 0) return null;
    return this._formatter.join(pairs);
  }

  /**
   * Build the full SQL comment from tags.
   * Mirrors: ActiveRecord::QueryLogs.comment
   */
  comment(): string | null {
    if (this._cacheEnabled && this._cachedComment !== undefined) {
      return this._cachedComment;
    }
    const result = this.uncachedComment();
    if (this._cacheEnabled) {
      this._cachedComment = result;
    }
    return result;
  }

  private uncachedComment(): string | null {
    const content = this.tagContent();
    if (!content) return null;
    return `/*${escapeComment(content)}*/`;
  }
}

/**
 * Sanitize a string for safe inclusion in a SQL comment.
 * Mirrors: ActiveRecord::QueryLogs.escape_sql_comment
 */
export function escapeComment(content: string): string {
  let s = content;
  // Replace comment markers to prevent SQL comment injection
  s = s.replace(/\*\//g, "* /").replace(/\/\*/g, "/ *");
  return s;
}
