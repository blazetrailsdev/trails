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
import type { QueryTransformer } from "./query-transformers.js";

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
export class QueryLogs implements QueryTransformer {
  private _tags: TagDefinition[] = [];
  private _tagsFormatter: "legacy" | "sqlcommenter" = "legacy";
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

  /**
   * Get the current tags formatter type ("legacy" or "sqlcommenter").
   * Mirrors: ActiveRecord::QueryLogs.tags_formatter
   */
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
      this._tagsFormatter = "legacy";
      this._formatter = LegacyFormatter;
    } else if (format === "sqlcommenter") {
      this._tagsFormatter = "sqlcommenter";
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
      // invoked: `MyFormatter.format(k, v)`). Detect the known
      // built-ins so `tagsFormatter` stays accurate when the caller
      // passes the class value directly (`logs.formatter = SQLCommenter`).
      if (format === SQLCommenter) {
        this._tagsFormatter = "sqlcommenter";
      } else if (format === LegacyFormatter) {
        this._tagsFormatter = "legacy";
      } else {
        this._tagsFormatter = "legacy"; // unknown custom formatter
      }
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
   *
   * The `connection` argument mirrors Rails' two-arg `call(sql, connection)`
   * (query_logs.rb:139): it is threaded down to `tagContent()` so tag procs
   * can read `context.connection`. It is optional here so the existing
   * single-arg unit tests keep working; the query pipeline passes the live
   * adapter once the transformer loop is wired (PR 3).
   *
   * Mirrors: ActiveRecord::QueryLogs.call
   */
  call(sql: string, connection?: unknown): string {
    const comment = this.comment(connection);
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
   *
   * Mirrors Rails' `tag_content(connection)` (query_logs.rb:226): it works on
   * a per-call copy of the context and injects `context[:connection] ||=
   * connection`, so tag procs can read `context.connection` without the
   * passed connection clobbering one already present in the context.
   *
   * Mirrors: ActiveRecord::QueryLogs.tag_content
   *
   * @internal
   */
  tagContent(connection?: unknown): string | null {
    // Per-call copy so the injected connection never leaks into the
    // persistent _context. `connection` is opaque (not a TagValue), hence the
    // local widening to Record<string, unknown> for the assignment.
    const context: Record<string, TagValue> = { ...this._context };
    if (connection !== undefined && context.connection == null) {
      (context as Record<string, unknown>).connection = connection;
    }
    // Collect [key, value] then sort by key, mirroring Rails' rebuild_handlers
    // (query_logs.rb:177) `handlers.sort_by! { |(key, _)| key.to_s }` — multi-tag
    // comments are emitted in alphabetical key order, independent of how the
    // tags were declared. Rails sorts the handler list once at `tags=` time; we
    // sort the resolved entries here, which yields the same ordering.
    const entries: [string, TagValue][] = [];
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
    // Bytewise key order, matching Ruby's String#<=> in sort_by!.
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return this._formatter.join(entries.map(([key, value]) => this._formatter.format(key, value)));
  }

  /**
   * Build the full SQL comment from tags.
   * Mirrors: ActiveRecord::QueryLogs.comment
   *
   * @internal
   */
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

  // private

  private escapeSqlComment(content: string): string {
    // Mirrors: ActiveRecord::QueryLogs#escape_sql_comment
    return escapeComment(content);
  }
}

// Sanitize a string for safe inclusion in a SQL comment by neutralising
// any internal "*/" and "/*" sequences (turns them into "* /" / "/ *").
//
// Partial port of ActiveRecord::QueryLogs#escape_sql_comment
// (query_logs.rb:219-228). Rails additionally strips a leading
// `\A\s*/\*\+?\s?` and a trailing `\s?\*/\s*\Z` before escaping; trails
// intentionally omits that strip so bare-marker inputs round-trip
// through escape rather than collapsing to an empty string — the
// existing "escaping bad comments" test cases encode that.
export function escapeComment(content: string): string {
  return String(content).replace(/\*\//g, "* /").replace(/\/\*/g, "/ *");
}

/**
 * Build the [name, handler] pairs list from the current tag definitions,
 * sorted by name. Called when tags change so the list stays consistent.
 *
 * Mirrors: ActiveRecord::QueryLogs#rebuild_handlers (private)
 *
 * @internal
 */
export function rebuildHandlers(
  tags: TagDefinition[],
): [string, (ctx: Record<string, TagValue>) => TagValue][] {
  const handlers: [string, (ctx: Record<string, TagValue>) => TagValue][] = [];
  for (const tag of tags) {
    if (typeof tag === "function") {
      // Function tags are invoked directly — mirror tagContent()'s "custom" branch.
      const fn = tag as TagHandler;
      handlers.push(["custom", (ctx) => fn(ctx) as TagValue]);
    } else if (typeof tag === "object" && tag !== null) {
      for (const [k, v] of Object.entries(tag)) {
        handlers.push([k, buildHandler(k, v as TagValue | TagHandler)]);
      }
    } else {
      const name = String(tag);
      handlers.push([name, buildHandler(name)]);
    }
  }
  handlers.sort((a, b) => a[0].localeCompare(b[0]));
  return handlers;
}

/**
 * Build a callable handler for a single tag definition. String tags become
 * GetKeyHandler lookups; zero-arity functions are wrapped to ignore the ctx
 * arg; functions with args are used as-is; static values become identity
 * functions returning that value.
 *
 * Mirrors: ActiveRecord::QueryLogs#build_handler (private)
 *
 * @internal
 */
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
