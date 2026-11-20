import { ActionController } from "../../namespaces.js";
import { Concern, extend, include } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { FlashHash } from "../../action-dispatch/middleware/flash.js";
import { ConditionalGet, type Etagger } from "./conditional-get.js";

export const EtagWithFlash = {};
extend(EtagWithFlash, Concern);
include(EtagWithFlash, ConditionalGet);
Concern.included.call(EtagWithFlash, null, function (this: object) {
  (this as typeof ConditionalGet.ClassMethods & { etaggers: Etagger[] }).etag(async function (
    this: unknown,
  ) {
    const controller = this as { request: object; flash: Promise<FlashHash> };
    if (rbObjRespondTo(controller.request, "flash") && !(await controller.flash).isEmpty()) {
      return await controller.flash;
    }
  });
});

ActionController.EtagWithFlash = EtagWithFlash;
