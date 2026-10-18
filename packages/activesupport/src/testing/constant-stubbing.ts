import { NameError } from "../core-ext/name-error.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

export function stubConst<T>(
  mod: Record<string, unknown>,
  constant: string,
  newValue: unknown,
  block: () => T,
  { exists = true }: { exists?: boolean } = {},
): T {
  if (exists) {
    if (!Object.prototype.hasOwnProperty.call(mod, constant)) {
      throw new NameError(`uninitialized constant ${constant}`, constant);
    }
    const oldValue = mod[constant];
    const ensure = () => {
      delete mod[constant];
      mod[constant] = oldValue;
    };
    let deferred = false;
    try {
      delete mod[constant];
      mod[constant] = newValue;
      const result = block();
      if (isThenable(result)) {
        deferred = true;
        return Promise.resolve(result).finally(ensure) as T;
      }
      return result;
    } finally {
      if (!deferred) ensure();
    }
  } else {
    if (constant in mod) {
      throw new NameError(`already defined constant ${constant} in ${String(mod.name ?? "")}`);
    }

    const ensure = () => delete mod[constant];
    let deferred = false;
    try {
      mod[constant] = newValue;
      const result = block();
      if (isThenable(result)) {
        deferred = true;
        return Promise.resolve(result).finally(ensure) as T;
      }
      return result;
    } finally {
      if (!deferred) ensure();
    }
  }
}
