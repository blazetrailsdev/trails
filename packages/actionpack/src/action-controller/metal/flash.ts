import { classAttribute, included } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { AbstractController } from "../../abstract-controller/base.js";
import type { helperMethod, HelpersClassMethods } from "../../abstract-controller/helpers.js";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import { redirectTo as redirectingRedirectTo } from "./redirecting.js";

/** @internal */
export interface FlashClassHost extends HelpersClassMethods {
  helperMethod?: typeof helperMethod;
  prototype: object;
  _flashTypes: string[];
  methodAdded(name: string): void;
}

export class Flash {
  static [included](base: FlashClassHost & { addFlashTypes(...types: string[]): void }): void {
    classAttribute.call(base, "_flashTypes", { instanceAccessor: false, default: [] });
    base.addFlashTypes("alert", "notice");
  }

  redirectTo(
    this: { constructor: unknown; flash: FlashHash },
    options: unknown = {},
    responseOptionsAndFlash: Record<string, unknown> = {},
  ): void {
    for (const flashType of (this.constructor as FlashClassHost)._flashTypes) {
      const type = responseOptionsAndFlash[flashType];
      delete responseOptionsAndFlash[flashType];
      if (type != null && type !== false) {
        this.flash.set(flashType, type);
      }
    }

    const otherFlashes = responseOptionsAndFlash.flash;
    delete responseOptionsAndFlash.flash;
    if (otherFlashes != null && otherFlashes !== false) {
      this.flash.update(otherFlashes as Record<string, unknown>);
    }

    redirectingRedirectTo.call(this as never, options, responseOptionsAndFlash);
  }
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
  const host = this as FlashClassHost & { _actionMethodCache?: Set<string> };
  if (
    !Object.prototype.hasOwnProperty.call(host, "_actionMethodCache") ||
    !host._actionMethodCache
  ) {
    const flashTypes = new Set(host._flashTypes.map(String));
    const methods = AbstractController.actionMethods.call(
      host as unknown as typeof AbstractController,
    );
    host._actionMethodCache = new Set(methods.filter((name) => !flashTypes.has(name)));
  }
  return [...host._actionMethodCache];
}
