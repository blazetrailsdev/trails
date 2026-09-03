/** @noRailsEquivalent PERMANENT */
export let APP_PATH: string | undefined;

/** @noRailsEquivalent PERMANENT */
export let ENGINE_PATH: string | undefined;

/** @noRailsEquivalent PERMANENT */
export function setAppPath(path: string | undefined): void {
  APP_PATH = path;
}

/** @noRailsEquivalent PERMANENT */
export function setEnginePath(path: string | undefined): void {
  ENGINE_PATH = path;
}
