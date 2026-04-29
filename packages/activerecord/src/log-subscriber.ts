import { Attribute } from "@blazetrails/activemodel";
import {
  BacktraceCleaner,
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
      const castedParams = this.typeCastedBinds(
        payload.type_casted_binds ?? payload.typeCastedBinds,
      );
      const bindPairs: [string | null, unknown][] = [];

      for (let i = 0; i < (payload.binds as any[]).length; i++) {
        const attr = (payload.binds as any[])[i];
        const filteredParams = this.filter(this.extractAttributeName(attr, i), castedParams?.[i]);
        bindPairs.push(this.renderBind(attr, filteredParams));
      }

      binds = `  ${safeJsonStringify(bindPairs)}`;
    }

    const colorizedName = this.colorizePayloadName(name, payload.name as string | undefined);
    const colorizedSql = this.colorizeLogging
      ? this.color(sql, this.sqlColor(sql), { bold: true })
      : sql;

    const message = `  ${colorizedName}  ${colorizedSql}${binds ?? ""}`;
    this.debugSql(message);
  }

  /** @internal */
  override get logger(): Logger | null {
    // Rails: `def logger; ActiveRecord::Base.logger; end`
    // Returns Base.logger directly — null means logging disabled.
    const B = getBase();
    if (B && "logger" in B) return B.logger as Logger | null;
    return (this.constructor as typeof LogSubscriber).logger;
  }

  protected debugSql(message: string): boolean {
    const l = this.logger;
    if (!l) return false;
    const result = l.debug(message);

    if (_verboseQueryLogs) {
      this.logQuerySource();
    }

    return result;
  }

  private logQuerySource(): void {
    const source = this.querySourceLocation();
    if (source) {
      const l = this.logger;
      if (l) l.debug(`  ↳ ${source}`);
    }
  }

  private querySourceLocation(): string | null {
    try {
      const err = new Error();
      const stack = (err.stack?.split("\n") ?? []).slice(2).map((l) => l.trim());
      const cleaned = LogSubscriber._backtraceCleaner.clean(stack);
      const frame = cleaned[0];
      return frame ? frame.replace(/^at\s+/, "") : null;
    } catch {
      return null;
    }
  }

  private static _backtraceCleaner: BacktraceCleaner = (() => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace(/^at\s+/, ""));
    cleaner.addSilencer(
      (line) =>
        line.includes("log-subscriber") ||
        line.includes("LogSubscriber") ||
        line.includes("notifications") ||
        line.includes("node_modules"),
    );
    return cleaner;
  })();

  private typeCastedBinds(castedBinds: unknown): any[] {
    if (typeof castedBinds === "function") return castedBinds();
    return (castedBinds as any[]) ?? [];
  }

  private extractAttributeName(attr: any, _i: number): string | null {
    if (attr && typeof attr.name === "string") return attr.name;
    if (Array.isArray(attr) && attr[0] && typeof attr[0].name === "string") return attr[0].name;
    return null;
  }

  private resolveBindAttribute(attr: unknown): {
    name?: string;
    type?: { isBinary?: () => boolean; binary?: () => boolean };
    value?: unknown;
    valueForDatabase?: unknown;
  } | null {
    if (attr instanceof Attribute) return attr as never;
    if (
      attr &&
      typeof attr === "object" &&
      "type" in (attr as object) &&
      "value" in (attr as object)
    ) {
      return attr as never;
    }
    return null;
  }

  private renderBind(attr: unknown, value: unknown): [string | null, unknown] {
    // Rails: render_bind takes an ActiveModel::Attribute. Resolve real
    // Attribute instances via the activemodel API; also tolerate duck-typed
    // shapes (legacy bind descriptors used elsewhere in the adapter layer).
    const resolved = this.resolveBindAttribute(attr);
    if (resolved) {
      const isBinary = resolved.type?.isBinary?.() ?? resolved.type?.binary?.() ?? false;
      if (isBinary && resolved.value != null) {
        const raw =
          typeof resolved.valueForDatabase === "function"
            ? resolved.valueForDatabase()
            : resolved.valueForDatabase;
        const bytes = byteLength(raw ?? resolved.value);
        value = `<${bytes} bytes of binary data>`;
      }
      return [resolved.name ?? null, value];
    }

    if (Array.isArray(attr)) {
      const [head] = attr;
      const headName =
        head instanceof Attribute
          ? head.name
          : head &&
              typeof head === "object" &&
              typeof (head as { name?: unknown }).name === "string"
            ? (head as { name: string }).name
            : null;
      return [headName, value];
    }

    // Simple object with .name (e.g. query attribute descriptor)
    if (attr && typeof attr === "object" && typeof (attr as { name?: unknown }).name === "string") {
      return [(attr as { name: string }).name, value];
    }

    return [null, value];
  }

  private colorizePayloadName(name: string, payloadName: string | undefined): string {
    if (!payloadName || payloadName === "" || payloadName === "SQL") {
      return this.color(name, BaseLogSubscriber.MAGENTA, { bold: true });
    }
    return this.color(name, BaseLogSubscriber.CYAN, { bold: true });
  }

  private sqlColor(sql: string): string {
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

  private filter(name: string | null, value: unknown): unknown {
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
