import { DelegationError } from "@blazetrails/activesupport";

export interface ControllerHelperHost {
  _controller: ControllerLike | null;
  _request: unknown;
  _config: unknown;
  _defaultFormBuilder: unknown;
}

interface ControllerLike {
  request?: unknown;
  config?: { inheritableCopy(): unknown };
  defaultFormBuilder?: unknown;
  logger?: unknown;
  [key: string]: unknown;
}

export const CONTROLLER_DELEGATES = [
  "requestForgeryProtectionToken",
  "params",
  "session",
  "cookies",
  "response",
  "headers",
  "flash",
  "actionName",
  "controllerName",
  "controllerPath",
] as const;

export function installControllerInternals(prototype: object): void {
  for (const name of ["controller", "request"] as const) {
    const internalName = `_${name}` as const;
    Object.defineProperty(prototype, name, {
      get(this: Record<string, unknown>): unknown {
        return this[internalName];
      },
      set(this: Record<string, unknown>, value: unknown) {
        this[internalName] = value;
      },
      configurable: true,
    });
  }
}

export function assignController(
  this: ControllerHelperHost,
  controller: ControllerLike | null,
): void {
  this._controller = controller;
  if (controller) {
    if ("request" in controller) this._request = controller.request;
    if ("config" in controller) this._config = controller.config!.inheritableCopy();
    if ("defaultFormBuilder" in controller)
      this._defaultFormBuilder = controller.defaultFormBuilder;
  } else {
    this._request ??= null;
    this._config ??= null;
    this._defaultFormBuilder ??= null;
  }
}

export function logger(this: ControllerHelperHost): unknown {
  const controller = this._controller;
  return controller && "logger" in controller ? controller.logger : undefined;
}

export function installControllerDelegates(prototype: object): void {
  for (const name of CONTROLLER_DELEGATES) {
    Object.defineProperty(prototype, name, {
      get(this: ControllerHelperHost): unknown {
        const controller = this._controller;
        if (controller == null) throw DelegationError.nilTarget(name, "controller");
        return controller[name];
      },
      configurable: true,
    });
  }
}
