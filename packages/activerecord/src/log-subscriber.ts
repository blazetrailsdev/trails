import { Attribute } from "@blazetrails/activemodel";
import {
  any,
  BacktraceCleaner,
  callerLocations,
  classAttribute,
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  type Logger,
} from "@blazetrails/activesupport";
import { first, rbObjAsString, rbObjRespondTo, rtest } from "@blazetrails/ruby-compat";
import { verboseQueryLogs } from "./active-record.js";
import { ActiveRecord } from "./namespaces.js";

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
  return byteLength(rbObjAsString(value));
}

function unwrapDelegator(v: unknown): unknown {
  return v instanceof String && "__getobj__" in v
    ? (v as unknown as { __getobj__(): unknown }).__getobj__()
    : v;
}

function safeJsonStringify(value: unknown): string {
  const probe = JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : unwrapDelegator(v),
  );
  let marker = "@bigint@";
  while (probe.includes(marker)) marker += "@";
  const wrapped = JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? `${marker}${v.toString()}${marker}` : unwrapDelegator(v),
  );
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return wrapped.replace(new RegExp(`"${escaped}(-?\\d+)${escaped}"`, "g"), "$1");
}

export class LogSubscriber extends BaseLogSubscriber {
  static readonly IGNORE_PAYLOAD_NAMES = ["SCHEMA", "EXPLAIN"];

  declare static backtraceCleaner: BacktraceCleaner;
  declare backtraceCleaner: BacktraceCleaner;

  strictLoadingViolation(event: Event): void {
    this.debug(null, () => {
      const owner = event.payload.owner;
      const reflection = event.payload.reflection as any;
      return this.color(reflection.strictLoadingViolationMessage(owner), BaseLogSubscriber.RED);
    });
  }

  sql(event: Event): undefined {
    const payload = event.payload as Event["payload"] & { binds?: any[] | null };

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

    if (payload.binds != null && any(payload.binds)) {
      const castedParams = this.typeCastedBinds(
        payload.type_casted_binds ?? payload.typeCastedBinds,
      );
      const bindPairs: [string | null, unknown][] = [];

      for (const [i, attr] of payload.binds.entries()) {
        const attributeName: string | null = rbObjRespondTo(attr, "name")
          ? attr.name
          : rbObjRespondTo(attr, "get") && rbObjRespondTo(attr[i], "name")
            ? attr[i].name
            : null;

        const filteredParams = this.filter(attributeName, castedParams?.[i]);

        bindPairs.push(this.renderBind(attr, filteredParams));
      }

      binds = `  ${safeJsonStringify(bindPairs)}`;
    }

    const colorizedName = this.colorizePayloadName(name, payload.name as string | null | undefined);
    const colorizedSql = this.colorizeLogging
      ? this.color(sql, this.sqlColor(sql), { bold: true })
      : sql;

    const message = `  ${colorizedName}  ${colorizedSql}${binds ?? ""}`;
    return this.debug(message);
  }

  /** @internal */
  override get logger(): Logger | null {
    return ActiveRecord.Base.logger as Logger | null;
  }

  /** @internal */
  protected debug(progname: string | null = null, block?: () => string): undefined {
    if (!super._debug(block ?? progname ?? undefined)) return;

    if (verboseQueryLogs()) {
      this.logQuerySource();
    }
  }

  private logQuerySource(): void {
    const source = this.querySourceLocation();
    if (source) {
      this.logger!.debug(`  ↳ ${source}`);
    }
  }

  private querySourceLocation(): string | null {
    for (const location of callerLocations()) {
      const frame = this.backtraceCleaner.cleanFrame(String(location));
      if (frame) return frame;
    }
    return null;
  }

  private typeCastedBinds(castedBinds: unknown): any[] {
    if (typeof castedBinds === "function") return castedBinds();
    return (castedBinds as any[]) ?? [];
  }

  private renderBind(attr: unknown, value: unknown): [string | null, unknown] {
    if (attr instanceof Attribute) {
      if (attr.type!.isBinary() && rtest(attr.value())) {
        value = `<${byteLength(rbObjAsString(attr.valueForDatabase))} bytes of binary data>`;
      }
    } else if (Array.isArray(attr)) {
      attr = first(attr);
    } else {
      attr = null;
    }

    return [(attr as { name?: string } | null)?.name ?? null, value];
  }

  private colorizePayloadName(name: string, payloadName: string | null | undefined): string {
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
    return ActiveRecord.Base.inspectionFilter().filterParam(name as string, value);
  }
}

classAttribute.call(LogSubscriber, "backtraceCleaner", { default: new BacktraceCleaner() });

LogSubscriber.subscribeLogLevel("sql", "debug");
LogSubscriber.subscribeLogLevel("strict_loading_violation", "debug");
