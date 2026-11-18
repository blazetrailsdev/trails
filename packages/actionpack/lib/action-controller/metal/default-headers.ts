import { ActionController } from "../../namespaces.js";
import { Concern, extend } from "@blazetrails/activesupport";
import { Response } from "../../action-dispatch/http/response.js";
import type { Request } from "../../action-dispatch/http/request.js";

export async function makeResponseBang(request: Request): Promise<Response> {
  const res = await Response.create();
  res.request = request;
  return res;
}

export const ClassMethods = { makeResponseBang };

export const DefaultHeaders = { ClassMethods };
extend(DefaultHeaders, Concern);

ActionController.DefaultHeaders = DefaultHeaders;
