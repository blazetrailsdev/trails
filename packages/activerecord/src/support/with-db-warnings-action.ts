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
  const savedAction = Base.dbWarningsAction;
  const savedIgnore = Base.dbWarningsIgnore;
  Base.dbWarningsAction = action;
  Base.dbWarningsIgnore = ignore;
  try {
    await body();
  } finally {
    Base.dbWarningsAction = savedAction ?? "ignore";
    Base.dbWarningsIgnore = savedIgnore;
  }
}
