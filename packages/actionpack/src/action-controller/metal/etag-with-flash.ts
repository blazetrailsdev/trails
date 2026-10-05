import { Concern, Module, extend, include } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import { ConditionalGet, type Etagger } from "./conditional-get.js";

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
