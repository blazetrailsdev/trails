import { NameError } from "../core-ext/name-error.js";

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
    try {
      delete mod[constant];
      mod[constant] = newValue;
      return block();
    } finally {
      delete mod[constant];
      mod[constant] = oldValue;
    }
  } else {
    if (constant in mod) {
      throw new NameError(`already defined constant ${constant} in ${String(mod.name ?? "")}`);
    }

    try {
      mod[constant] = newValue;
      return block();
    } finally {
      delete mod[constant];
    }
  }
}
