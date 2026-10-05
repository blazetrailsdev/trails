import { Concern, Module, extend, include } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import {
  ConditionalGet,
  combineEtags as _combineEtags,
  httpCacheForever as _httpCacheForever,
  includeContent as _includeContent,
  noStore as _noStore,
  type ConditionalGetHost,
  type Etagger,
} from "./conditional-get.js";

/** @internal */
export function includeContent(status: number): boolean {
  return _includeContent(status);
}

export function httpCacheForever(
  this: ConditionalGetHost,
  options: { public?: boolean } = {},
  block?: () => void,
): void {
  return _httpCacheForever.call(this, options, block);
}

export function noStore(this: ConditionalGetHost): void {
  return _noStore.call(this);
}

/** @internal */
export function combineEtags(
  this: { etaggers: Etagger[] },
  validator: unknown,
  options: Record<string, unknown> = {},
): unknown[] {
  return _combineEtags.call(this, validator, options);
}

export const EtagWithFlash = new Module((mod) => {
  extend(mod, Concern);

  include(mod, ConditionalGet);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function (this: object) {
      (this as typeof ConditionalGet.ClassMethods & { etaggers: Etagger[] }).etag(function (
        this: unknown,
      ) {
        const controller = this as { request: object; flash: FlashHash };
        if (rbObjRespondTo(controller.request, "flash") && !controller.flash.isEmpty()) {
          return controller.flash;
        }
      });
    },
  );
});
