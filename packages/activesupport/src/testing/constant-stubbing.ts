/**
 * Mirrors: active_support/testing/constant_stubbing.rb
 *
 * A Ruby constant under a module is a property of an object here, so
 * `const_get`/`const_set`/`remove_const` are the property reads, writes and
 * deletes below, against the same `mod` receiver Rails takes.
 */
import { NameError } from "../core-ext/name-error.js";

/**
 * Changes the value of a constant for the duration of a block. Example:
 *
 *   // World.List.Import.LARGE_IMPORT_THRESHOLD === 5000
 *   stubConst(World.List.Import, "LARGE_IMPORT_THRESHOLD", 1, () => {
 *     assertEqual(1, World.List.Import.LARGE_IMPORT_THRESHOLD);
 *   });
 *
 *   assertEqual(5000, World.List.Import.LARGE_IMPORT_THRESHOLD);
 *
 * Using this method rather than forcing
 * `World.List.Import.LARGE_IMPORT_THRESHOLD = 5000` prevents warnings from
 * being thrown, and ensures that the old value is returned after the test has
 * completed.
 *
 * If the constant doesn't already exist, but you need it set for the duration
 * of the block you can do so by passing `exists: false`.
 *
 *   stubConst(object, "SOME_CONST", 1, () => {
 *     assertEqual(1, object.SOME_CONST);
 *   }, { exists: false });
 */
export function stubConst<T>(
  mod: Record<string, unknown>,
  constant: string,
  newValue: unknown,
  block: () => T,
  { exists = true }: { exists?: boolean } = {},
): T {
  if (exists) {
    // `mod.const_get(constant, false)` — `false` is `inherit`, so an
    // inherited constant is NOT found and Ruby raises NameError.
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
