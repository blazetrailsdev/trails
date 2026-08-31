import { DelegationError } from "@blazetrails/activesupport";

/**
 * ActionView::Helpers::ControllerHelper
 *
 * Keeps all methods and behavior in ActionView that simply delegates to the
 * controller. Mirrors
 * `actionview/lib/action_view/helpers/controller_helper.rb`.
 */

/** Host shape required by ControllerHelper — `attr_internal :controller, :request`. */
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

/** `CONTROLLER_DELEGATES` (controller_helper.rb:15-17). */
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

/**
 * `attr_internal :controller, :request` (controller_helper.rb:12).
 *
 * `attr_internal_define` (`core_ext/module/attr_internal.rb:39-47`) defines the
 * accessor on the underscored name, aliases the bare name to it, then
 * `remove_method`s the underscored one — so `controller` / `controller=` and
 * `request` / `request=` are the methods, and `@_controller` / `@_request` are
 * only ivars. A TS field is the ivar spelling, so the accessors are installed
 * over the `_`-prefixed fields here.
 */
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

/** `ControllerHelper#assign_controller(controller)` (controller_helper.rb:20-28). */
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

/** `ControllerHelper#logger` (controller_helper.rb:31-33). */
export function logger(this: ControllerHelperHost): unknown {
  const controller = this._controller;
  return controller && "logger" in controller ? controller.logger : undefined;
}

/**
 * `delegate(*CONTROLLER_DELEGATES, to: :controller)` (controller_helper.rb:19).
 * Ruby's `delegate` writes one method per name; the loop is the JS spelling of
 * that macro, and `respondTo` (controller_helper.rb:35-38) falls out of it
 * because a delegate reads through to the controller at call time.
 *
 * The `delegate` here passes no `allow_nil`, so the generated body
 * (`activesupport/lib/active_support/delegation.rb:129-143`) calls through and
 * converts the resulting `NoMethodError` into
 * `DelegationError.nil_target` when the target was nil — a view with no
 * controller raises on `params` rather than answering nil.
 */
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
