import { Callbacks as ASCallbacks, Concern, extend } from "@blazetrails/activesupport";
import {
  defineModule,
  include,
  rbModConstSet,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface CallbacksClass {
  defineCallbacks(...names: Array<string | Record<string, unknown>>): void;
}

export const Callbacks = defineModule({}) as {
  runCallbacks(kind: string, block?: () => unknown): unknown;
};
extend(Callbacks, Concern);
include(Callbacks, ASCallbacks);

include(rbObjSingletonClass(Callbacks), ASCallbacks);
(rbObjSingletonClass(Callbacks) as unknown as CallbacksClass).defineCallbacks("execute");

Concern.included.call(Callbacks as never, null, function (this: CallbacksClass) {
  this.defineCallbacks("perform", { skipAfterCallbacksIfTerminated: true });
  this.defineCallbacks("enqueue", { skipAfterCallbacksIfTerminated: true });
});

rbModConstSet(ActiveJob, "Callbacks", Callbacks);
