import { Concern, Module, extend } from "@blazetrails/activesupport";
import { rbObjClone } from "@blazetrails/ruby-compat";
import type { CallbackOptions, beforeAction } from "../../abstract-controller/callbacks.js";
import type { PermissionsPolicy as Policy } from "../../action-dispatch/http/permissions-policy.js";
import type { Request } from "../../action-dispatch/http/request.js";

/** @internal */
export interface PermissionsPolicyClassHost {
  beforeAction: OmitThisParameter<typeof beforeAction>;
}

export const ClassMethods = {
  permissionsPolicy(
    this: PermissionsPolicyClassHost,
    options: CallbackOptions = {},
    block?: (this: any, policy: Policy) => void,
  ): void {
    this.beforeAction((controller) => {
      if (block) {
        const request = (controller as unknown as { request: Request }).request;
        const policy = rbObjClone(request.permissionsPolicy!);
        block.call(controller, policy);
        request.permissionsPolicy = policy;
      }
    }, options);
  },
};

export const PermissionsPolicy = new Module((mod) => {
  extend(mod, Concern);
}) as Module<object> & { ClassMethods: typeof ClassMethods };
PermissionsPolicy.ClassMethods = ClassMethods;
