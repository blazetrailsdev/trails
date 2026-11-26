import type { Hash } from "@blazetrails/ruby-compat/hash";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";

type AnyObject = Record<string, unknown>;

export function withIndifferentAccess<K>(
  obj: AnyObject | Hash<K, unknown>,
): HashWithIndifferentAccess<unknown> {
  return new HashWithIndifferentAccess(obj);
}

export const nestedUnderIndifferentAccess = withIndifferentAccess;
