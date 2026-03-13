import type { Errors } from "../errors.js";

/**
 * Base validator interface.
 */
export interface Validator {
  validate(record: any, attribute: string, value: unknown, errors: Errors): void;
}

/**
 * Conditional options for validators.
 */
export type ConditionFn = ((record: any) => boolean) | string;

export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  on?: "create" | "update";
}

function evaluateCondition(record: any, cond: ConditionFn): boolean {
  if (typeof cond === "function") return cond(record);
  // String method name
  const method = (record as any)[cond];
  if (typeof method === "function") return method.call(record);
  return !!method;
}

export function shouldValidate(record: any, options: ConditionalOptions): boolean {
  if (options.if !== undefined) {
    const conds = Array.isArray(options.if) ? options.if : [options.if];
    for (const cond of conds) {
      if (!evaluateCondition(record, cond)) return false;
    }
  }
  if (options.unless !== undefined) {
    const conds = Array.isArray(options.unless) ? options.unless : [options.unless];
    for (const cond of conds) {
      if (evaluateCondition(record, cond)) return false;
    }
  }
  return true;
}
