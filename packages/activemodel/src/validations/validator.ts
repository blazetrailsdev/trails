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
export interface ConditionalOptions {
  if?: (record: any) => boolean;
  unless?: (record: any) => boolean;
  on?: "create" | "update";
}

export function shouldValidate(record: any, options: ConditionalOptions): boolean {
  if (options.if && !options.if(record)) return false;
  if (options.unless && options.unless(record)) return false;
  return true;
}
