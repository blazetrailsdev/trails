import { ActionController } from "../../namespaces.js";
import { rbCallSuper, rbClearMethodCache } from "@blazetrails/ruby-compat";
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

export function flash(this: { request: { flash: Promise<FlashHash> } }): Promise<FlashHash> {
  return this.request.flash;
}

export async function redirectTo<FlashType extends string = never>(
  this: { constructor: unknown; flash: Promise<FlashHash> },
  options: RedirectToOptions = {},
  responseOptionsAndFlash: RedirectToResponseOptionsAndFlash<FlashType> = {},
): Promise<number> {
  for (const flashType of (this.constructor as FlashClassHost)._flashTypes) {
    const type = (responseOptionsAndFlash as Record<string, unknown>)[flashType];
    delete (responseOptionsAndFlash as Record<string, unknown>)[flashType];
    if (type != null && type !== false) {
      (await this.flash).set(flashType, type);
    }
  }

  const otherFlashes = responseOptionsAndFlash.flash;
  delete responseOptionsAndFlash.flash;
  if (otherFlashes != null && (otherFlashes as unknown) !== false) {
    (await this.flash).update(otherFlashes);
  }

  return rbCallSuper(this, redirectTo, options, responseOptionsAndFlash) as Promise<number>;
}

export function addFlashTypes(this: FlashClassHost, ...types: string[]): void {
  for (const type of types) {
    if (this._flashTypes.includes(type)) continue;

    Object.defineProperty(this.prototype, type, {
      async get(this: { request: { flash: Promise<FlashHash> } }) {
        return (await this.request.flash).get(type);
      },
      configurable: true,
    });
    rbClearMethodCache();
    this.methodAdded(type);
    if (typeof this.helperMethod === "function") this.helperMethod(type);

    this._flashTypes = [...this._flashTypes, type];
  }
}

export function actionMethods(this: FlashClassHost): ReadonlySet<string> {
  const host = this as FlashClassHost & { _actionMethodCache?: ReadonlySet<string> };
  if (!Object.hasOwn(host, "_actionMethodCache") || !host._actionMethodCache) {
    const flashTypes = new Set(host._flashTypes.map(String));
    const methods = rbCallSuper(this, actionMethods) as ReadonlySet<string>;
    host._actionMethodCache = new Set([...methods].filter((name) => !flashTypes.has(name)));
  }
  return host._actionMethodCache;
}

export const ClassMethods = { addFlashTypes, actionMethods };

/** @missingRailsCall delegate — CONVERGEABLE flash-reader-is-a-hand-written-getter-not-a-delegate-call */
export const Flash = { ClassMethods, redirectTo };
extend(Flash, Concern);
Concern.included.call(Flash, null, function (this: FlashClassHost) {
  classAttribute.call(this, "_flashTypes", { instanceAccessor: false, default: [] });

  Object.defineProperty(this.prototype, "flash", { get: flash, configurable: true });
  rbClearMethodCache();
  this.addFlashTypes("alert", "notice");
});

ActionController.Flash = Flash;
