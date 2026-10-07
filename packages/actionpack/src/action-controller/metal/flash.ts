import { classAttribute, Concern, extend, Module } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { AbstractController } from "../../abstract-controller/base.js";
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

  return Flash.superMethod(this, "redirectTo")!(options, responseOptionsAndFlash) as number;
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
    if (rbObjRespondTo(this, "helperMethod")) this.helperMethod!(type);

    this._flashTypes = [...this._flashTypes, type];
  }
}

export function actionMethods(this: FlashClassHost): string[] {
  const host = this as FlashClassHost & { _actionMethodCache?: Map<string, string> };
  if (
    !Object.prototype.hasOwnProperty.call(host, "_actionMethodCache") ||
    !host._actionMethodCache
  ) {
    const flashTypes = new Set(host._flashTypes.map(String));
    AbstractController.actionMethods.call(host as unknown as typeof AbstractController);
    host._actionMethodCache = new Map(
      [...host._actionMethodCache!].filter(
        ([name, method]) => !flashTypes.has(name) && !flashTypes.has(method),
      ),
    );
  }
  return [...host._actionMethodCache.keys()];
}

export const ClassMethods = { addFlashTypes, actionMethods };

export const Flash = new Module((mod) => {
  extend(mod, Concern);

  (
    mod as unknown as { included(base: null, block: (this: FlashClassHost) => void): void }
  ).included(null, function (this: FlashClassHost) {
    classAttribute.call(this, "_flashTypes", { instanceAccessor: false, default: [] });

    Object.defineProperty(this.prototype, "flash", { get: flash, configurable: true });
    (this as FlashClassHost & typeof ClassMethods).addFlashTypes("alert", "notice");
  });

  mod.defineMethod("redirectTo", redirectTo);
}) as Module<{ redirectTo: typeof redirectTo }> & { ClassMethods: typeof ClassMethods };
Flash.ClassMethods = ClassMethods;
export type Flash = { redirectTo: typeof redirectTo };
