import { ArgumentError } from "@blazetrails/ruby-compat";

import { convertToModel, modelNameFromRecordOrClass } from "./model-naming.js";

export { convertToModel, modelNameFromRecordOrClass };

export const JOIN = "_";
export const NEW = "new";

export function domClass(recordOrClass: unknown, prefix: string | null = null): string {
  const singular = modelNameFromRecordOrClass(recordOrClass).paramKey;
  return prefix != null ? `${prefix}${JOIN}${singular}` : singular;
}

export function domId(recordOrClass: unknown, prefix: string | null = null): string {
  if (recordOrClass == null || recordOrClass === false) {
    throw new ArgumentError(
      `dom_id must be passed a record_or_class as the first argument, you passed ${String(recordOrClass)}`,
    );
  }

  const recordId =
    typeof recordOrClass === "function" ? undefined : recordKeyForDomId(recordOrClass);
  if (recordId != null) {
    return `${domClass(recordOrClass, prefix)}${JOIN}${recordId}`;
  } else {
    return domClass(recordOrClass, prefix ?? NEW);
  }
}

/** @internal */
export function recordKeyForDomId(record: unknown): string | null {
  const key = (convertToModel(record) as { toKey: () => unknown[] | null }).toKey();
  return key && key.every((k) => k != null && k !== false) ? key.join(JOIN) : null;
}
