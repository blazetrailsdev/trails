/** @internal */

import type { Configurable as ConfigurableClass } from "./configurable.js";

/** @internal */

export let Configurable = undefined as unknown as typeof ConfigurableClass;

/** @internal */

export function _setConfigurable(configurable: typeof ConfigurableClass): void {
  Configurable = configurable;
}
