import { ActionController } from "../../namespaces.js";
import { rbCallSuper, rbModConstSet } from "@blazetrails/ruby-compat";
import { classAttribute, Concern, extend } from "@blazetrails/activesupport";
import type { helperMethod, HelpersClassMethods } from "../../abstract-controller/helpers.js";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import type { RedirectToOptions, RedirectToResponseOptions } from "./redirecting.js";

export type RedirectToResponseOptionsAndFlash<FlashType extends string = never> =
  RedirectToResponseOptions & {
    alert?: string;
    notice?: string;
    flash?: Record<string, unknown>;
  } & { [K in NoInfer<FlashType>]?: unknown };

/** @internal */
export interface FlashClassHost extends HelpersClassMethods {
  helperMethod?: OmitThisParameter<typeof helperMethod>;
  prototype: object;
  _flashTypes: string[];
  methodAdded(name: string): void;
  addFlashTypes(...types: string[]): void;
}

export function flash(this: { request: { flash: FlashHash | null } }): FlashHash | null {
  return this.request.flash;
}

export function redirectTo<FlashType extends string = never>(
  this: { constructor: unknown; flash: FlashHash },
  options: RedirectToOptions = {},
  responseOptionsAndFlash: RedirectToResponseOptionsAndFlash<FlashType> = {},
): number {
  for (const flashType of (this.constructor as FlashClassHost)._flashTypes) {
    const type = (responseOptionsAndFlash as Record<string, unknown>)[flashType];
    delete (responseOptionsAndFlash as Record<string, unknown>)[flashType];
    if (type != null && type !== false) {
      this.flash.set(flashType, type);
    }
  }

  const otherFlashes = responseOptionsAndFlash.flash;
  delete responseOptionsAndFlash.flash;
  if (otherFlashes != null && (otherFlashes as unknown) !== false) {
    this.flash.update(otherFlashes);
  }

  return rbCallSuper(this, redirectTo, options, responseOptionsAndFlash) as number;
}

export function addFlashTypes(this: FlashClassHost, ...types: string[]): void {
  for (const type of types) {
    if (this._flashTypes.includes(type)) continue;

    Object.defineProperty(this.prototype, type, {
      get(this: { request: { flash: FlashHash } }) {
        return this.request.flash.get(type);
      },
      configurable: true,
    });
    this.methodAdded(type);
    if (typeof this.helperMethod === "function") this.helperMethod(type);

    this._flashTypes = [...this._flashTypes, type];
  }
}

export function actionMethods(this: FlashClassHost): string[] {
  const host = this as FlashClassHost & { _actionMethodCache?: Set<string> };
  if (!Object.hasOwn(host, "_actionMethodCache") || !host._actionMethodCache) {
    const flashTypes = new Set(host._flashTypes.map(String));
    const methods = rbCallSuper(this, actionMethods) as string[];
    host._actionMethodCache = new Set(methods.filter((name) => !flashTypes.has(name)));
  }
  return [...host._actionMethodCache];
}

export const ClassMethods = { addFlashTypes, actionMethods };

/** @missingRailsCall delegate — CONVERGEABLE base-included-modules-dispatch-privates-through-self */
export const Flash = { ClassMethods, redirectTo };
extend(Flash, Concern);
Concern.included.call(Flash as never, null, function (this: FlashClassHost) {
  classAttribute.call(this, "_flashTypes", { instanceAccessor: false, default: [] });

  Object.defineProperty(this.prototype, "flash", { get: flash, configurable: true });
  this.addFlashTypes("alert", "notice");
});

rbModConstSet(ActionController, "Flash", Flash);
