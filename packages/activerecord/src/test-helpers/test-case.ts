import { expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { SQLCounter } from "../testing/query-assertions.js";

export async function captureSqlAndBinds(fn: () => unknown): Promise<[string, unknown[]][]> {
  const counter = new SQLCounter();
  return Notifications.subscribed(counter, "sql.active_record", async () => {
    await fn();
    return counter.logFull;
  });
}

export async function assertColumn(
  model: typeof Base,
  columnName: string,
  msg?: string,
): Promise<void> {
  void model.resetColumnInformation();
  await model.loadSchema();
  expect(model.columnNames(), msg).toContain(columnName);
}

export async function assertNoColumn(
  model: typeof Base,
  columnName: string,
  msg?: string,
): Promise<void> {
  void model.resetColumnInformation();
  await model.loadSchema();
  expect(model.columnNames(), msg).not.toContain(columnName);
}
