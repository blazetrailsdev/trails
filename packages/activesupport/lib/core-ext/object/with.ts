import { NoMethodError } from "@blazetrails/ruby-compat";

function with_<T extends object, R>(
  obj: T,
  attributes: Partial<Record<Extract<keyof T, string>, unknown>>,
  fn: (obj: T) => R,
): R {
  const target = obj as Record<string, unknown>;
  const oldValues: Record<string, unknown> = {};
  let deferred = false;
  try {
    for (const [key, value] of Object.entries(attributes)) {
      if (!(key in target)) throw new NoMethodError(`undefined method '${key}'`);
      oldValues[key] = target[key];
      publicSendWriter(target, key, value);
    }
    const result = fn(obj);
    if (_isThenable(result)) {
      deferred = true;
      return Promise.resolve(result).finally(() => {
        for (const [key, oldValue] of Object.entries(oldValues)) {
          publicSendWriter(target, key, oldValue);
        }
      }) as R;
    }
    return result;
  } finally {
    if (!deferred) {
      for (const [key, oldValue] of Object.entries(oldValues)) {
        publicSendWriter(target, key, oldValue);
      }
    }
  }
}

function _isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
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

export { with_ as with };
