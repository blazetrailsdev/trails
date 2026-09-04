/** @internal */
export let _DEFAULT_ENV: (() => string) | null = null;

/** @internal */
export function _setDefaultEnv(fn: () => string): void {
  _DEFAULT_ENV = fn;
}

/** @internal */
export let _railsEnv: string | null = null;

/** @internal */
export function _setRailsEnv(value: string | null): void {
  _railsEnv = value;
}
