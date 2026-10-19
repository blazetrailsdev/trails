import { ActionController } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Concern, extend } from "@blazetrails/activesupport";
import { Response } from "../../action-dispatch/http/response.js";
import type { Request } from "../../action-dispatch/http/request.js";

export function makeResponseBang(request: Request): Response {
  const res = Response.create();
  res.request = request;
  return res;
}

export const ClassMethods = { makeResponseBang };

export const DefaultHeaders = { ClassMethods };
extend(DefaultHeaders, Concern);

rbModConstSet(ActionController, "DefaultHeaders", DefaultHeaders);
