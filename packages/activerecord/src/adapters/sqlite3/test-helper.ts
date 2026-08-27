import { expect } from "vitest";
import { Notifications, squish } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";

export async function assertLogged(
  expected: Array<[string, string, unknown[]]>,
  fn: () => unknown | Promise<unknown>,
): Promise<void> {
  const logged: Array<[string, string, unknown[]]> = [];
  const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
    const p = event.payload as Record<string, unknown>;
    logged.push([squish(String(p.sql ?? "")), String(p.name ?? ""), (p.binds as unknown[]) ?? []]);
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
  expect(logged).toEqual(expected);
}
