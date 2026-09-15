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
      publicSendWriter(target, key, value);
    }
    return fn(obj);
  } finally {
    for (const [key, oldValue] of Object.entries(oldValues)) {
      publicSendWriter(target, key, oldValue);
    }
  }
}

function publicSendWriter(target: Record<string, unknown>, key: string, value: unknown): void {
  for (let o: object | null = target; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, key);
    if (!descriptor) continue;
    if (descriptor.get && !descriptor.set) throw new NoMethodError(`undefined method '${key}='`);
    break;
  }
  target[key] = value;
}
