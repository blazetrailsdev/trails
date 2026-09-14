import { expect } from "vitest";
import type { Base } from "../base.js";

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
