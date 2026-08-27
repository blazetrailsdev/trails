import { ActiveRecord } from "../ar-config.js";
import type { SQLWarning } from "../errors.js";

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((w: SQLWarning) => void);

export async function withDbWarningsAction(
  action: DbWarningsAction,
  warningsToIgnore: (string | RegExp)[] | (() => Promise<void> | void),
  fn?: () => Promise<void> | void,
): Promise<void> {
  const body = (
    typeof warningsToIgnore === "function" ? warningsToIgnore : fn
  ) as () => Promise<void> | void;
  const ignore = Array.isArray(warningsToIgnore) ? warningsToIgnore : [];
  const savedAction = ActiveRecord.dbWarningsAction;
  const savedIgnore = ActiveRecord.dbWarningsIgnore;
  ActiveRecord.dbWarningsAction = action;
  ActiveRecord.dbWarningsIgnore = ignore;
  try {
    await body();
  } finally {
    ActiveRecord.dbWarningsAction = savedAction ?? "ignore";
    ActiveRecord.dbWarningsIgnore = savedIgnore;
  }
}
