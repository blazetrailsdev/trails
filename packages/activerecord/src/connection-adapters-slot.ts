import type { resolve } from "./connection-adapters.js";

/** @internal */
export let _ConnectionAdapters: { resolve: typeof resolve } | undefined;

/** @internal */
export function _setConnectionAdapters(connectionAdapters: { resolve: typeof resolve }): void {
  _ConnectionAdapters = connectionAdapters;
}
