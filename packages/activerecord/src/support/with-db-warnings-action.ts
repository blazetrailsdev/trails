import { ActiveRecord } from "../ar-config.js";
import { Base } from "../base.js";
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
  const savedIgnore = Base.dbWarningsIgnore;
  ActiveRecord.dbWarningsAction = action;
  Base.dbWarningsIgnore = ignore;
  try {
    await body();
  } finally {
    ActiveRecord.dbWarningsAction = savedAction ?? "ignore";
    Base.dbWarningsIgnore = savedIgnore;
  }
}
