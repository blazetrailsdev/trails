import type { CallbackChain } from "@blazetrails/activesupport";
import type { Base } from "../base.js";

type CallbacksHost = typeof Base & Record<string, CallbackChain | undefined>;

export async function resetCallbacks(
  klass: typeof Base,
  kind: string,
  block: () => void | Promise<void>,
): Promise<void> {
  const oldCallbacks = new Map<typeof Base, CallbackChain | undefined>();
  try {
    oldCallbacks.set(klass, (klass as CallbacksHost)[`_${kind}Callbacks`]?.dup());
    for (const subclass of klass.subclasses) {
      oldCallbacks.set(subclass, (subclass as CallbacksHost)[`_${kind}Callbacks`]?.dup());
    }
    await block();
  } finally {
    (klass as CallbacksHost)[`_${kind}Callbacks`] = oldCallbacks.get(klass);
    for (const subclass of klass.subclasses) {
      (subclass as CallbacksHost)[`_${kind}Callbacks`] = oldCallbacks.get(subclass);
    }
  }
}
