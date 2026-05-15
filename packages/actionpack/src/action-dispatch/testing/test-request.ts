import type { RackEnv } from "@blazetrails/rack";
import { Request } from "../http/request.js";

export class TestRequest extends Request {
  constructor(env: RackEnv = {}) {
    super({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "test.host",
      SERVER_NAME: "test.host",
      SERVER_PORT: "80",
      ...env,
    });
  }
}
