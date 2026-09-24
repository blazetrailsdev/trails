import { validateApp } from "./uri/gid.js";

let _app: string | undefined;

export function setApp(name: string): void {
  _app = validateApp(name);
}

export function getApp(): string | undefined {
  return _app;
}

/** @internal */
export function _resetApp(): void {
  _app = undefined;
}
