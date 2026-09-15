import type { SQLWarning } from "../errors.js";
import {
  dbWarningsAction,
  dbWarningsIgnore,
  setDbWarningsAction,
  setDbWarningsIgnore,
} from "../active-record.js";

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
  const savedAction = dbWarningsAction();
  const savedIgnore = dbWarningsIgnore();
  setDbWarningsAction(action);
  setDbWarningsIgnore(ignore);
  try {
    await body();
  } finally {
    setDbWarningsAction(savedAction ?? "ignore");
    setDbWarningsIgnore(savedIgnore);
  }
}
