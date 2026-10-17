import { ActionController } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Concern, Module, extend } from "@blazetrails/activesupport";
import { Response } from "../../action-dispatch/http/response.js";
import type { Request } from "../../action-dispatch/http/request.js";

export function makeResponseBang(request: Request): Response {
  const res = Response.create();
  res.request = request;
  return res;
}

export const ClassMethods = { makeResponseBang };

export const DefaultHeaders = new Module((mod) => {
  extend(mod, Concern);
}) as Module & { ClassMethods: typeof ClassMethods };
DefaultHeaders.ClassMethods = ClassMethods;

rbModConstSet(ActionController, "DefaultHeaders", DefaultHeaders);
