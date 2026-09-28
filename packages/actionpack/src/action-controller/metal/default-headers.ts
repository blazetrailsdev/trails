import { Response } from "../../action-dispatch/http/response.js";
import type { Request } from "../../action-dispatch/http/request.js";

export const DefaultHeaders = {
  ClassMethods: {
    makeResponseBang(request: Request): Response {
      const res = Response.create();
      res.request = request;
      return res;
    },
  },
};
