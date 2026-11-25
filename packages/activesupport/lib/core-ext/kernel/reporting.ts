import { rbEnsure } from "@blazetrails/ruby-compat/ensure";
import { setVerbose, verbose } from "@blazetrails/ruby-compat/verbose";

export function silenceWarnings<T>(block: () => T): T {
  return withWarnings(null, block);
}

export function enableWarnings<T>(block: () => T): T {
  return withWarnings(true, block);
}

export function withWarnings<T>(flag: unknown, block: () => T): T {
  const oldVerbose = verbose();
  setVerbose(flag);
  return rbEnsure(block, () => {
    setVerbose(oldVerbose);
  });
}

export function suppress<T>(
  fn: () => T,
  ...errorClasses: Array<new (...args: never[]) => Error>
): T | null {
  try {
    return fn();
  } catch (e) {
    if (errorClasses.some((cls) => e instanceof cls)) return null;
    throw e;
  }
}
