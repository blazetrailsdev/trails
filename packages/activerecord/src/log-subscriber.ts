import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  type Logger,
} from "@blazetrails/activesupport";

/**
 * Compute byte length of a value, mirroring Rails' `to_s.bytesize`.
 * Handles strings, Buffers, TypedArrays, and falls back to string conversion.
 */
function byteLength(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") {
    return typeof Buffer !== "undefined"
      ? Buffer.byteLength(value)
      : new TextEncoder().encode(value).length;
  }
  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
  }
  if (typeof (value as any).byteLength === "number") return (value as any).byteLength;
  return byteLength(String(value));
}

/**
 * JSON.stringify that handles bigint values (converts to string)
 * so logging never throws on valid bind values.
 */
function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

let _baseResolver: (() => any) | null = null;

/**
 * Set the resolver for ActiveRecord::Base, avoiding circular imports.
 * Called from index.ts during module initialization.
 */
export function setBaseResolver(resolver: () => any): void {
  _baseResolver = resolver;
}

function getBase(): any {
  return _baseResolver?.() ?? null;
}

/** Module-level config mirroring `ActiveRecord.verbose_query_logs`. */
let _verboseQueryLogs = false;
export function getVerboseQueryLogs(): boolean {
  return _verboseQueryLogs;
}
export function setVerboseQueryLogs(value: boolean): void {
  _verboseQueryLogs = value;
}

/**
 * ActiveRecord::LogSubscriber — logs SQL queries with coloring, timing,
 * and bind parameter display. Mirrors Rails' ActiveRecord::LogSubscriber.
 */
export class LogSubscriber extends BaseLogSubscriber {
  static readonly IGNORE_PAYLOAD_NAMES = ["SCHEMA", "EXPLAIN"];

  strictLoadingViolation(event: Event): void {
    this._debug(() => {
      const owner = event.payload.owner;
      const reflection = event.payload.reflection as any;
      return this.color(reflection.strictLoadingViolationMessage(owner), BaseLogSubscriber.RED);
    });
  }

  sql(event: Event): void {
    const payload = event.payload;

    if (LogSubscriber.IGNORE_PAYLOAD_NAMES.includes(payload.name as string)) return;

    let name: string;
    if (payload.async) {
      const lockWait = Number(payload.lock_wait ?? payload.lockWait ?? 0);
      name = `ASYNC ${payload.name ?? ""} (${lockWait.toFixed(1)}ms) (db time ${event.duration.toFixed(1)}ms)`;
    } else {
      name = `${payload.name ?? ""} (${event.duration.toFixed(1)}ms)`;
    }

    if (payload.cached) {
      name = `CACHE ${name}`;
    }

    const sql = payload.sql as string;
    let binds: string | null = null;

    if (payload.binds && Array.isArray(payload.binds) && payload.binds.length > 0) {
      const castedParams = this._typeCastedBinds(
        payload.type_casted_binds ?? payload.typeCastedBinds,
      );
      const bindPairs: [string | null, unknown][] = [];

      for (let i = 0; i < (payload.binds as any[]).length; i++) {
        const attr = (payload.binds as any[])[i];
        const filteredParams = this._filter(this._extractAttributeName(attr, i), castedParams?.[i]);
        bindPairs.push(this._renderBind(attr, filteredParams));
      }

      binds = `  ${safeJsonStringify(bindPairs)}`;
    }

    const colorizedName = this._colorizePayloadName(name, payload.name as string | undefined);
    const colorizedSql = this.colorizeLogging
      ? this.color(sql, this._sqlColor(sql), { bold: true })
      : sql;

    const message = `  ${colorizedName}  ${colorizedSql}${binds ?? ""}`;
    this._debugSql(message);
  }

  override get logger(): Logger | null {
    // Rails: `def logger; ActiveRecord::Base.logger; end`
    // Returns Base.logger directly — null means logging disabled.
    const B = getBase();
    if (B && "logger" in B) return B.logger as Logger | null;
    return (this.constructor as typeof LogSubscriber).logger;
  }

  // -- Private helpers -----------------------------------------------------

  protected _debugSql(message: string): boolean {
    const l = this.logger;
    if (!l) return false;
    const result = l.debug(message);

    if (_verboseQueryLogs) {
      this._logQuerySource();
    }

    return result;
  }

  private _logQuerySource(): void {
    const source = this._querySourceLocation();
    if (source) {
      const l = this.logger;
      if (l) l.debug(`  ↳ ${source}`);
    }
  }

  protected _querySourceLocation(): string | null {
    try {
      const err = new Error();
      const stack = err.stack?.split("\n") ?? [];
      for (const line of stack.slice(2)) {
        const trimmed = line.trim();
        if (
          !trimmed.includes("log-subscriber") &&
          !trimmed.includes("LogSubscriber") &&
          !trimmed.includes("notifications") &&
          !trimmed.includes("node_modules")
        ) {
          return trimmed.replace(/^at\s+/, "");
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private _typeCastedBinds(castedBinds: unknown): any[] {
    if (typeof castedBinds === "function") return castedBinds();
    return (castedBinds as any[]) ?? [];
  }

  private _extractAttributeName(attr: any, _i: number): string | null {
    if (attr && typeof attr.name === "string") return attr.name;
    if (Array.isArray(attr) && attr[0] && typeof attr[0].name === "string") return attr[0].name;
    return null;
  }

  private _renderBind(attr: any, value: unknown): [string | null, unknown] {
    // ActiveModel::Attribute — has type and value properties
    if (attr && typeof attr === "object" && "type" in attr && "value" in attr) {
      if (attr.type?.binary?.() && attr.value != null) {
        const raw =
          typeof attr.valueForDatabase === "function" ? attr.valueForDatabase() : attr.value;
        const bytes = byteLength(raw);
        value = `<${bytes} bytes of binary data>`;
      }
      return [attr.name ?? null, value];
    }

    if (Array.isArray(attr)) {
      return [attr[0]?.name ?? null, value];
    }

    // Simple object with .name (e.g. query attribute descriptor)
    if (attr && typeof attr === "object" && typeof attr.name === "string") {
      return [attr.name, value];
    }

    return [null, value];
  }

  private _colorizePayloadName(name: string, payloadName: string | undefined): string {
    if (!payloadName || payloadName === "" || payloadName === "SQL") {
      return this.color(name, BaseLogSubscriber.MAGENTA, { bold: true });
    }
    return this.color(name, BaseLogSubscriber.CYAN, { bold: true });
  }

  private _sqlColor(sql: string): string {
    if (/^\s*rollback/im.test(sql)) return BaseLogSubscriber.RED;
    if (/select .*for update/ims.test(sql) || /^\s*lock/im.test(sql))
      return BaseLogSubscriber.WHITE;
    if (/^\s*select/i.test(sql)) return BaseLogSubscriber.BLUE;
    if (/^\s*insert/i.test(sql)) return BaseLogSubscriber.GREEN;
    if (/^\s*update/i.test(sql)) return BaseLogSubscriber.YELLOW;
    if (/^\s*delete/i.test(sql)) return BaseLogSubscriber.RED;
    if (/transaction\s*$/i.test(sql)) return BaseLogSubscriber.CYAN;
    return BaseLogSubscriber.MAGENTA;
  }

  private _filter(name: string | null, value: unknown): unknown {
    const B = getBase();
    if (B && typeof B.inspectionFilter === "function") {
      const filter = B.inspectionFilter();
      if (filter && typeof filter.filterParam === "function") {
        return filter.filterParam(name, value);
      }
    }
    return value;
  }
}

// Register log-level gates matching Rails' class-body `subscribe_log_level` calls.
LogSubscriber.subscribeLogLevel("sql", "debug");
LogSubscriber.subscribeLogLevel("strict_loading_violation", "debug");
