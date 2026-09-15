import { NoMethodError } from "@blazetrails/ruby-compat";

export function objectWith<T extends object, R>(
  obj: T,
  attributes: Partial<Record<Extract<keyof T, string>, unknown>>,
  fn: (obj: T) => R,
): R {
  const target = obj as Record<string, unknown>;
  const oldValues: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(attributes)) {
      if (!(key in target)) throw new NoMethodError(`undefined method '${key}'`);
      oldValues[key] = target[key];
      target[key] = value;
    }
    return fn(obj);
  } finally {
    for (const [key, oldValue] of Object.entries(oldValues)) {
      target[key] = oldValue;
    }
  }
}
