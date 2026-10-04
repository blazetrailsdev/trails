import { classAttribute, extend, included } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { AbstractController } from "../../abstract-controller/base.js";
import type { helperMethod, HelpersClassMethods } from "../../abstract-controller/helpers.js";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import {
  redirectTo as redirectingRedirectTo,
  type RedirectToOptions,
  type RedirectToResponseOptions,
} from "./redirecting.js";

export type RedirectToResponseOptionsAndFlash<FlashType extends string = never> =
  RedirectToResponseOptions & {
    alert?: string;
    notice?: string;
    flash?: Record<string, unknown>;
  } & { [K in NoInfer<FlashType>]?: unknown };

/** @internal */
export interface FlashClassHost extends HelpersClassMethods {
  helperMethod?: typeof helperMethod;
  prototype: object;
  _flashTypes: string[];
  methodAdded(name: string): void;
}

export class Flash {
  static ClassMethods = { addFlashTypes, actionMethods };

  static [included](base: FlashClassHost): void {
    extend(base, Flash.ClassMethods);
    classAttribute.call(base, "_flashTypes", { instanceAccessor: false, default: [] });

    (base as FlashClassHost & typeof Flash.ClassMethods).addFlashTypes("alert", "notice");
  }

  get flash(): FlashHash | null {
    return (this as unknown as { request: { flash: FlashHash | null } }).request.flash;
  }

  redirectTo<FlashType extends string = never>(
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

    return redirectingRedirectTo.call(this as never, options, responseOptionsAndFlash);
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
