import { AbstractAdapter } from "../../lib/connection-adapters/abstract-adapter.js";
import type { QuotingDispatchHost } from "../../lib/connection-adapters/abstract/quoting.js";

export function quotingHost<T extends object>(overrides?: T): QuotingDispatchHost & T {
  return Object.assign(Object.create(AbstractAdapter.prototype), overrides);
}
