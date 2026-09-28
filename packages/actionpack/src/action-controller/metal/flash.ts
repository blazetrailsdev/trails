import { AbstractController } from "../../abstract-controller/base.js";
import { helperMethod, type HelpersClassMethods } from "../../abstract-controller/helpers.js";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";

/** @internal */
export interface FlashClassHost extends HelpersClassMethods {
  prototype: object;
  _flashTypes: string[];
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
    helperMethod(this, type);

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
