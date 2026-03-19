/**
 * Automatically append comments to SQL queries with runtime information.
 *
 * Mirrors: ActiveRecord::QueryLogs
 *
 * Query logs add SQL comments containing contextual tags (application name,
 * controller, action, etc.) to help trace queries back to application code.
 */

export type TagValue = string | number | boolean | null | undefined;
export type TagHandler = (context?: Record<string, TagValue>) => TagValue;
export type TagDefinition = string | TagHandler | Record<string, TagValue | TagHandler>;

export interface QueryLogsFormatter {
  format(key: string, value: TagValue): string;
  join(pairs: string[]): string;
}

/**
 * Legacy Rails format: key:value pairs.
 * Example: /* application:MyApp, controller:users * /
 */
export const LegacyFormatter: QueryLogsFormatter = {
  format(key: string, value: TagValue): string {
    return `${key}:${value}`;
  },
  join(pairs: string[]): string {
    return pairs.join(", ");
  },
};

/**
 * SQLCommenter format (OpenTelemetry standard).
 * Example: /* application='MyApp',controller='users' * /
 */
export const SQLCommenter: QueryLogsFormatter = {
  format(key: string, value: TagValue): string {
    return `${sqlCommenterEncode(key)}='${sqlCommenterEncode(String(value))}'`;
  },
  join(pairs: string[]): string {
    return pairs.join(",");
  },
};

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

  get tags(): TagDefinition[] {
    return this._tags;
  }

  set tags(tags: TagDefinition[]) {
    this._tags = tags;
    this._cachedComment = undefined;
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
    } else if (typeof format === "object" && format !== null) {
      this._formatter = format;
    } else {
      throw new Error(`Formatter is unsupported: ${format}`);
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

  private comment(): string | null {
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
    const pairs: string[] = [];
    for (const tag of this._tags) {
      if (typeof tag === "string") {
        const value = this._context[tag];
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
    const content = this._formatter.join(pairs);
    return `/*${escapeComment(content)}*/`;
  }
}

/**
 * Encode a value for SQLCommenter format.
 * Uses encodeURIComponent plus additional escaping for single quotes.
 */
function sqlCommenterEncode(value: string): string {
  return encodeURIComponent(value).replace(/'/g, "%27");
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
