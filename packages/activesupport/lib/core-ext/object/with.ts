import { rbFSend } from "@blazetrails/ruby-compat";

function with_<T extends object, R>(
  obj: T,
  attributes: Partial<Record<Extract<keyof T, string>, unknown>>,
  fn: (obj: T) => R,
): R {
  const oldValues: Record<string, unknown> = {};
  let deferred = false;
  try {
    for (const [key, value] of Object.entries(attributes)) {
      oldValues[key] = rbFSend(obj, key);
      rbFSend(obj, `${key}=`, value);
    }
    const result = fn(obj);
    if (_isThenable(result)) {
      deferred = true;
      return Promise.resolve(result).finally(() => {
        for (const [key, oldValue] of Object.entries(oldValues)) {
          rbFSend(obj, `${key}=`, oldValue);
        }
      }) as R;
    }
    return result;
  } finally {
    if (!deferred) {
      for (const [key, oldValue] of Object.entries(oldValues)) {
        rbFSend(obj, `${key}=`, oldValue);
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

export { with_ as with };
