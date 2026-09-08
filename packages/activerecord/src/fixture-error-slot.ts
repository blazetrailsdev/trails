import type { FixtureError } from "./fixtures.js";

/** @internal */

export let _FixtureError: typeof FixtureError | undefined;

/** @internal */

export function _setFixtureError(fixtureError: typeof FixtureError): void {
  _FixtureError = fixtureError;
}
