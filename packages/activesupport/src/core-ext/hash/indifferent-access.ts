import type { Hash } from "@blazetrails/ruby-compat";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

type AnyObject = Record<string, unknown>;

export function withIndifferentAccess(
  obj: AnyObject | Hash<unknown, unknown>,
): HashWithIndifferentAccess<unknown> {
  return new HashWithIndifferentAccess(obj);
}

export const nestedUnderIndifferentAccess = withIndifferentAccess;
