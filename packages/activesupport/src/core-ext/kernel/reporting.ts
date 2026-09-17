import { setVerbose, verbose } from "@blazetrails/ruby-compat";

export function silenceWarnings<T>(block: () => T): T {
  return withWarnings(null, block);
}

export function enableWarnings<T>(block: () => T): T {
  return withWarnings(true, block);
}

export function withWarnings<T>(flag: unknown, block: () => T): T {
  const oldVerbose = verbose();
  setVerbose(flag);
  try {
    return block();
  } finally {
    setVerbose(oldVerbose);
  }
}
