import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { pgDatetimeConfig } from "../../connection-adapters/postgresql/pg-datetime-config.js";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationSubscriber, NotificationEvent } from "@blazetrails/activesupport";
import { pgAvailable, pgHasHintPlan, pgServerVersion } from "../../support/describe-if-pg.js";

export { describeIfPg, pgServerVersion, PG_TEST_URL } from "../../support/describe-if-pg.js";

export const pgSupportsOptimizerHints = pgAvailable && pgHasHintPlan;
export const pgSupportsNativePartitioning = pgServerVersion >= 100000;

export { withPostgresqlDatetimeType } from "../../support/with-postgresql-datetime-type.js";

export async function withNativeDatabaseTypeOverrides<T>(
  overrides: Record<string, string | { name?: string; limit?: number }>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const saved = { ...pgDatetimeConfig.nativeDatabaseTypesOverrides };
  Object.assign(pgDatetimeConfig.nativeDatabaseTypesOverrides, overrides);
  try {
    return await fn();
  } finally {
    pgDatetimeConfig.nativeDatabaseTypesOverrides = saved;
  }
}

export { PostgreSQLAdapter };

export function suiteTable(name: string, suite: string): string {
  return `${name}_${suite}`;
}

export class SQLSubscriber {
  readonly logged: Array<[string, string, unknown[]]> = [];
  readonly payloads: Array<Record<string, unknown>> = [];
  private _sub: NotificationSubscriber | null = null;

  start(): void {
    this.stop();
    this._sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      const p = event.payload as Record<string, unknown>;
      this.payloads.push(p);
      this.logged.push([
        squish(String(p.sql ?? "")),
        String(p.name ?? ""),
        (p.binds as unknown[]) ?? [],
      ]);
    });
  }

  stop(): void {
    if (this._sub) {
      Notifications.unsubscribe(this._sub);
      this._sub = null;
    }
  }
}
