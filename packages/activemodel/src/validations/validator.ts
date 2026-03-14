import type { Errors } from "../errors.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRecord = any;

/**
 * Base validator interface.
 */
export interface Validator {
  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void;
}

/**
 * Conditional options for validators.
 */
export type ConditionFn = ((record: AnyRecord) => boolean) | string;

export interface ConditionalOptions {
  if?: ConditionFn | ConditionFn[];
  unless?: ConditionFn | ConditionFn[];
  on?: string;
}

function evaluateCondition(record: AnyRecord, cond: ConditionFn): boolean {
  if (typeof cond === "function") return cond(record);
  const method = record[cond];
  if (typeof method === "function") return method.call(record);
  return !!method;
}

export function shouldValidate(record: AnyRecord, options: ConditionalOptions): boolean {
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
